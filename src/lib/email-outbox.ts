import { and, eq, inArray, lt, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { emailOutbox } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { sendMail, toPlainText } from "@/lib/mailer"

// =============================================================================
// Transactional email outbox (ROADMAP P1.5)
//
// Fire-and-forget `sendMail(...)` calls lose the send when a serverless
// invocation freezes or the process dies after the domain write commits.
// Instead, callers persist a row here in the same transaction as the domain
// change, then drain it:
//
//   - `enqueueEmail(payload, tx)` writes the row (inside the caller's tx when
//     one is passed, so state + intent commit together).
//   - `flushEmailOutbox()` / `drainEmailOutbox()` send due rows through the
//     existing mailer (which writes the `email_log` delivery record) and delete
//     the row on success, or requeue it with exponential backoff on failure.
//
// Retrying matters because the mail this carries is activation and
// password-reset links — losing one to a single transient SMTP blip defeats the
// point of having an outbox at all. A failing row returns to PENDING with
// `nextAttemptAt` pushed 2/4/8/16 minutes out, and only parks as FAILED once
// MAX_OUTBOX_ATTEMPTS is spent, so a permanently bad address still ends up
// reviewable (with `lastError`) instead of looping forever. Only the
// plain-text version of the body is stored.
// =============================================================================

/**
 * Sends per row before the row is parked as FAILED for manual review.
 *
 * Exported so tests assert against this rather than a copy of the number.
 */
export const MAX_OUTBOX_ATTEMPTS = 5

/**
 * Minutes to wait after the 1st, 2nd, 3rd and 4th failed send.
 *
 * Exponential: a brief outage recovers in minutes, while a sustained one backs
 * off instead of hammering the provider. 2 + 4 + 8 + 16 = 30 minutes of retry
 * before `MAX_OUTBOX_ATTEMPTS` parks the row.
 */
const RETRY_BACKOFF_MINUTES = [2, 4, 8, 16]

/** Transaction handle as returned by `db.transaction()`. */
export type EmailOutboxTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface OutboxEmail {
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

const STALE_SENDING_MS = 10 * 60_000

export interface DrainResult {
  claimed: number
  sent: number
  failed: number
}

/** Persist an email for delivery. Pass `tx` to commit it with the domain
 *  change it describes. */
export async function enqueueEmail(
  email: OutboxEmail,
  tx?: EmailOutboxTx,
): Promise<void> {
  const runner = tx ?? db
  // Only the plain-text body is kept — the HTML is not stored.
  const text = email.text ?? (email.html ? toPlainText(email.html) : null)
  await runner.insert(emailOutbox).values({
    to: Array.isArray(email.to) ? email.to.join(", ") : email.to,
    subject: email.subject,
    text,
  })
}

/**
 * Send every due outbox row (up to `limit`). Claims rows under
 * `FOR UPDATE SKIP LOCKED`, so concurrent drains never double-send. Returns
 * counts for logging/tests.
 *
 * A row that fails to send goes back to PENDING with a delayed
 * `nextAttemptAt`; once `MAX_OUTBOX_ATTEMPTS` is spent it is parked as FAILED
 * (with `lastError`) for review rather than being retried indefinitely.
 */
export async function drainEmailOutbox({
  limit = 20,
}: {
  limit?: number
} = {}): Promise<DrainResult> {
  const now = new Date()
  const nowIso = now.toISOString()

  // Recover rows a dead worker left mid-send.
  await db
    .update(emailOutbox)
    .set({ status: "PENDING", updatedAt: nowIso })
    .where(
      and(
        eq(emailOutbox.status, "SENDING"),
        lt(
          emailOutbox.updatedAt,
          new Date(now.getTime() - STALE_SENDING_MS).toISOString(),
        ),
      ),
    )

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, "PENDING"),
          lte(emailOutbox.nextAttemptAt, nowIso),
        ),
      )
      .orderBy(emailOutbox.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true })

    if (rows.length > 0) {
      await tx
        .update(emailOutbox)
        .set({ status: "SENDING", updatedAt: nowIso })
        .where(
          inArray(
            emailOutbox.id,
            rows.map((row) => row.id),
          ),
        )
    }
    return rows
  })

  let sent = 0
  let failed = 0

  for (const row of claimed) {
    try {
      await sendMail({
        to: row.to,
        subject: row.subject,
        ...(row.text ? { text: row.text } : {}),
      })
      // Success: `email_log` is the delivery record, so drop the queue row.
      await db.delete(emailOutbox).where(eq(emailOutbox.id, row.id))
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const attempts = row.attempts + 1
      const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS
      // Index by the attempt just made. Unreachable past the table while
      // `attempts` is capped at MAX_OUTBOX_ATTEMPTS, but keep the longest wait
      // rather than a negative index if that ever changes.
      const backoffMinutes =
        RETRY_BACKOFF_MINUTES[
          Math.min(attempts, RETRY_BACKOFF_MINUTES.length) - 1
        ]

      await db
        .update(emailOutbox)
        .set({
          // Requeue instead of parking: this outbox exists precisely so a
          // delivery hiccup cannot cost someone their activation or
          // password-reset link. Only an exhausted row stops retrying.
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          lastError: message.slice(0, 500),
          ...(exhausted
            ? {}
            : {
                nextAttemptAt: new Date(
                  Date.now() + backoffMinutes * 60_000,
                ).toISOString(),
              }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(emailOutbox.id, row.id))
      failed++
    }
  }

  return { claimed: claimed.length, sent, failed }
}

/** Drain once and never throw — for use right after a domain commit. */
export async function flushEmailOutbox(limit = 20): Promise<void> {
  try {
    await drainEmailOutbox({ limit })
  } catch (err) {
    logger.error("Email outbox flush failed", { err })
  }
}
