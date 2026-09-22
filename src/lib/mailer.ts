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
// logs" history. Failed sends are additionally stored in `failed_mail` as
// before, for any future manual-resend tooling.

import { eq } from "drizzle-orm"
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer"
import { siteConfig } from "@/config/site"
import { db, dbRead } from "@/lib/db"
import { emailLog, failedMail, mailConfig } from "@/lib/db/schema"

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
        pass: row.pass,
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
      error: error ?? null,
      body: payload.html ?? null,
      textBody,
    })
  } catch (dbErr) {
    console.error("[mailer] Failed to write email_log entry:", dbErr)
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

  // Always log the plain text version for debugging
  if (text) {
    console.log(
      `[mailer] Sending to ${payload.to} | Subject: ${payload.subject}\n---\n${text}\n---`,
    )
  }

  if (process.env.MAIL_DISABLED === "1") {
    console.log(`[mailer] MAIL_DISABLED=1, skipping send to ${payload.to}`)
    return
  }
  const { maxRetries = 2, baseDelayMs = 1000, onRetry } = options

  const config = await getSmtpConfig()
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
      console.log(`[mailer] Email sent to ${payload.to} (attempt ${attempt})`)
      await logEmail(payload, "SENT", attempt)
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(
        `[mailer] Attempt ${attempt}/${totalAttempts} failed:`,
        lastError.message,
      )

      if (attempt === totalAttempts) break

      const delay = baseDelayMs * 2 ** (attempt - 1)
      console.log(`[mailer] Retrying in ${delay}ms…`)
      onRetry?.(attempt, lastError)
      await sleep(delay)
    }
  }

  // All retries exhausted — persist to DB so it can be investigated / re-sent.
  try {
    await db.insert(failedMail).values({
      to: Array.isArray(payload.to) ? payload.to.join(", ") : payload.to,
      subject: payload.subject,
      html: payload.html ?? null,
      text: payload.text ?? null,
      error: lastError?.message ?? "Unknown error",
      attempts: totalAttempts,
    })
    console.error(`[mailer] Logged failed email to DB (to: ${payload.to})`)
  } catch (dbErr) {
    // Don't let a DB failure swallow the original mail error.
    console.error("[mailer] Failed to log failed email to DB:", dbErr)
  }
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
