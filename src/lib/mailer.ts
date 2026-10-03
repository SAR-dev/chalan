// Generic SMTP mailer.
//
// Uses nodemailer under the hood. SMTP config is read from the `mail_config`
// DB table (managed via Super Admin settings).
//
// Usage:
//   await sendMail({ to: "x@y.com", subject: "Hi", html: "<b>Hello</b>" })
//
// A send is attempted exactly once — there is no retry loop. Every attempt is
// recorded in the `email_log` table (SENT on success, FAILED on failure); this
// is the Admin/Super Admin "Email logs" history. Failed mails stay in the DB so
// they can be reviewed or manually re-sent.

import { eq } from "drizzle-orm"
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer"
import { siteConfig } from "@/config/site"
import { decryptSecret } from "@/lib/crypto"
import { db, dbRead } from "@/lib/db"
import { emailLog, mailConfig } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { redactAndTruncate } from "@/lib/redact"

export interface MailPayload {
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

/** SMTP values taken straight from the Add Config form for a pre-save test. */
export interface TestSmtpConfig {
  host: string
  port: string
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
}

// Cached transporter — recreated whenever the SMTP identity changes (host,
// port, secure, user or password), so a config change (including delete +
// recreate with the same host/port/user) takes effect on the next send.
let cachedTransporter: Transporter | null = null
let cachedConfigKey = ""

/** Read SMTP config from the DB. Throws if no active config exists. */
async function getSmtpConfig(): Promise<SmtpConfig> {
  try {
    const [row] = await dbRead
      .select()
      .from(mailConfig)
      .where(eq(mailConfig.isActive, true))
      .limit(1)
    if (row) {
      return {
        host: row.host,
        port: Number(row.port),
        secure: row.secure,
        user: row.user,
        pass: decryptSecret(row.pass),
        fromEmail: row.fromEmail,
        fromName: row.fromName,
      }
    }
  } catch {
    // Table may not exist yet during migrations — fall through.
  }
  throw new Error(
    "[mailer] No active SMTP configuration found. Add one via the Super Admin mail config page.",
  )
}

/** Get or create a transporter for the current config. */
async function getTransporter(): Promise<Transporter> {
  const config = await getSmtpConfig()
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}`
  if (cachedTransporter && cachedConfigKey === key) {
    return cachedTransporter
  }
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 5_000,
    socketTimeout: 10_000,
  })
  cachedConfigKey = key
  return cachedTransporter
}

/** Strip HTML tags and decode common entities for a plain-text version. */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " — ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Inserts one row into `email_log` for a resolved send attempt (success or
// failure). Never throws — logging must not mask the original mail outcome.
//
// The row used to store the *entire* HTML body, unbounded. It is
// now truncated to MAX_LOGGED_BODY characters. Only the plain-text version is
// stored (no HTML) — that is what the admin Email Logs page needs to show what
// was sent and what a manual re-send uses. Single-use link parameters are kept
// here on purpose: the table is admin-only, pruned after
// EMAIL_LOG_RETENTION_DAYS (default 10; failed rows are never deleted), and
// the tokens in it expire in 24h and are consumed on first use — whereas the
// *console* log (which reaches log aggregators and CI output) is redacted, so
// no live token is written there.
const MAX_LOGGED_BODY = 2_000

function boundForLog(value: string, max = MAX_LOGGED_BODY): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n… [truncated ${value.length - max} chars]`
}

async function logEmail(
  payload: MailPayload,
  status: (typeof emailLog.$inferInsert)["status"],
  attempts: number,
  error?: string,
) {
  try {
    let textBody = payload.text ?? null
    if (!textBody && payload.html) {
      textBody = toPlainText(payload.html)
    }
    await db.insert(emailLog).values({
      to: Array.isArray(payload.to) ? payload.to.join(", ") : payload.to,
      subject: payload.subject,
      status,
      attempts,
      error: error ? boundForLog(error, 500) : null,
      textBody: textBody ? boundForLog(textBody) : null,
    })
  } catch (dbErr) {
    logger.error("Failed to write email_log entry", { err: dbErr })
  }
}

export async function sendMail(payload: MailPayload): Promise<void> {
  // Auto-generate plain text from HTML if not provided.
  let text = payload.text
  if (payload.html && !text) {
    text = toPlainText(payload.html)
  }

  // Log the plain-text version for debugging — redacted and truncated, because
  // It carries password-reset/activation links. Writing those to
  // stdout put live tokens in container logs, CI output and log aggregators.
  //
  // Redaction alone still shipped customer message content (and
  // names, addresses, order details) into stdout on *every* send. The body is
  // now opt-in via `LOG_EMAIL_BODY=1`; by default only the envelope is logged.
  // The full body remains available in the admin-only `email_log` table.
  logger.info("Sending email", {
    to: payload.to,
    subject: payload.subject,
    ...(text && process.env.LOG_EMAIL_BODY === "1"
      ? { body: redactAndTruncate(text) }
      : {}),
  })

  if (process.env.MAIL_DISABLED === "1") {
    logger.info("MAIL_DISABLED=1, skipping send", { to: payload.to })
    return
  }

  // A missing/broken SMTP config would otherwise throw before the send and
  // vanish without an email_log row — log it as a FAILED attempt so the
  // admin Email Logs page (and the e2e activation flow) can see the message.
  let config: Awaited<ReturnType<typeof getSmtpConfig>>
  try {
    config = await getSmtpConfig()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logEmail(payload, "FAILED", 0, message)
    throw err
  }

  const mailOptions: SendMailOptions = {
    from: `"${config.fromName || siteConfig.name}" <${config.fromEmail}>`,
    ...payload,
  }

  if (text) {
    mailOptions.text = text
  }

  // Single attempt — no retries.
  try {
    const transport = await getTransporter()
    await transport.sendMail(mailOptions)
    logger.info("Email sent", { to: payload.to })
    await logEmail(payload, "SENT", 1)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    logger.warn("Email send failed", { to: payload.to, err: error })
    // The failure is captured by email_log — failed mails are kept in the DB
    // for review/manual re-send (the standalone `failed_mail` table was
    // dropped in favour of email_log).
    await logEmail(payload, "FAILED", 1, error.message)
    throw error
  }
}

// Sends a diagnostic test email using SMTP values entered in the Add Config
// form — BEFORE the config is saved. It never reads the DB (the config does
// not exist yet) and, unlike sendMail(), deliberately does NOT write an
// `email_log` row: this is a pre-save connection check, not domain mail, and
// the unsaved credentials must not appear in the delivery history.
//
// Throws on failure (calling code maps the error to a 400).
export async function sendTestMail(
  config: TestSmtpConfig,
  to: string,
): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 5_000,
    socketTimeout: 10_000,
  })

  logger.info("Sending SMTP test email", { to, host: config.host })

  const result = await transporter.sendMail({
    from: `"${config.fromName || siteConfig.name}" <${config.fromEmail}>`,
    to,
    subject: "SMTP configuration test",
    text:
      "This is a test email. If you received this, the SMTP configuration " +
      `(${config.host}:${config.port}) is working correctly.`,
  })

  return { messageId: result.messageId ?? "" }
}
