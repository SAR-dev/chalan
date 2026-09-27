// Generic SMTP mailer with retry logic and exponential backoff.
//
// Uses nodemailer under the hood. SMTP config is read from the `mail_config`
// DB table (managed via Super Admin settings).
//
// Usage:
//   await sendMail({ to: "x@y.com", subject: "Hi", html: "<b>Hello</b>" })
//
// Every fully-resolved send attempt (delivered, or all retries exhausted) is
// recorded in the `email_log` table — this is the Admin/Super Admin "Email
// logs" history.

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

export interface SendMailOptions_ {
  maxRetries?: number // default: 3
  baseDelayMs?: number // default: 1000 — doubles on each retry
  onRetry?: (attempt: number, error: Error) => void
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

// Cached transporter — recreated when DB config changes.
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
  const key = `${config.host}:${config.port}:${config.user}`
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Strip HTML tags and decode common entities for a plain-text fallback. */
function stripHtml(html: string): string {
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

// Inserts one row into `email_log` for a fully-resolved send attempt
// (success or exhausted-retries failure). Never throws — logging must not
// mask the original mail outcome.
//
// ROADMAP P0.7: the row used to store the *entire* HTML body, unbounded. It is
// now truncated to MAX_LOGGED_BODY characters, which is all the admin Email
// Logs page needs to show what was sent. Single-use link parameters are kept
// here on purpose: the table is admin-only, pruned after
// EMAIL_LOG_RETENTION_DAYS (default 10), and the tokens in it expire in 24h and
// are consumed on first use — whereas the *console* log (which reaches log
// aggregators and CI output) is redacted, so no live token is written there.
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
      textBody = stripHtml(payload.html)
    }
    await db.insert(emailLog).values({
      to: Array.isArray(payload.to) ? payload.to.join(", ") : payload.to,
      subject: payload.subject,
      status,
      attempts,
      error: error ? boundForLog(error, 500) : null,
      body: payload.html ? boundForLog(payload.html) : null,
      textBody: textBody ? boundForLog(textBody) : null,
    })
  } catch (dbErr) {
    logger.error("Failed to write email_log entry", { err: dbErr })
  }
}

export async function sendMail(
  payload: MailPayload,
  options: SendMailOptions_ = {},
): Promise<void> {
  // Auto-generate plain text from HTML if not provided
  let text = payload.text
  if (payload.html && !text) {
    if (typeof payload.html === "string") {
      text = stripHtml(payload.html)
    }
  }

  // Log the plain-text version for debugging — redacted and truncated, because
  // it carries password-reset/activation links (ROADMAP P0.7). Writing those to
  // stdout put live tokens in container logs, CI output and log aggregators.
  //
  // ROADMAP P4.4: redaction alone still shipped customer message content (and
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
  const { maxRetries = 2, baseDelayMs = 1000, onRetry } = options

  // A missing/broken SMTP config would otherwise throw before the retry loop
  // and vanish without an email_log row — log it as a FAILED attempt so the
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

  let lastError: Error | null = null
  const totalAttempts = maxRetries + 1

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const transport = await getTransporter()
      await transport.sendMail(mailOptions)
      logger.info("Email sent", { to: payload.to, attempt })
      await logEmail(payload, "SENT", attempt)
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      logger.warn("Email attempt failed", {
        to: payload.to,
        attempt,
        totalAttempts,
        err: lastError,
      })

      if (attempt === totalAttempts) break

      const delay = baseDelayMs * 2 ** (attempt - 1)
      logger.info("Retrying email", { to: payload.to, attempt, delayMs: delay })
      onRetry?.(attempt, lastError)
      await sleep(delay)
    }
  }

  // All retries exhausted — the failed send is captured by email_log below
  // with status "FAILED" (the standalone `failed_mail` table was dropped).
  await logEmail(
    payload,
    "FAILED",
    totalAttempts,
    lastError?.message ?? "Unknown error",
  )

  throw new Error(
    `[mailer] Failed after ${totalAttempts} attempts. Last error: ${lastError?.message}`,
  )
}
