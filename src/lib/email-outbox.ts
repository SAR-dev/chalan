import { and, eq, inArray, lt, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { emailOutbox } from "@/lib/db/schema"
import { sendMail } from "@/lib/mailer"

// =============================================================================
// Transactional email outbox (ROADMAP P1.5)
//
// Fire-and-forget `sendMail(...)` calls lose the send (and its in-process
// retries) when a serverless invocation freezes or the process dies after the
// domain write commits. Instead, callers persist a row here in the same
// transaction as the domain change, then drain it:
//
//   - `enqueueEmail(payload, tx)` writes the row (inside the caller's tx when
//     one is passed, so state + intent commit together).
//   - `flushEmailOutbox()` / `drainEmailOutbox()` send due rows through the
//     existing mailer (which writes the `email_log` delivery record) and delete
//     the row on success, or requeue it with exponential backoff on failure.
//   - `POST /api/cron/drain-email-outbox` drains rows left behind by a crash.
// =============================================================================

/** Transaction handle as returned by `db.transaction()`. */
export type EmailOutboxTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface OutboxEmail {
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

const MAX_ATTEMPTS = 5
const STALE_SENDING_MS = 10 * 60_000

export interface DrainResult {
  claimed: number
  sent: number
  failed: number
  requeued: number
}

/** Persist an email for delivery. Pass `tx` to commit it with the domain
 *  change it describes. */
export async function enqueueEmail(
  email: OutboxEmail,
  tx?: EmailOutboxTx,
): Promise<void> {
  const runner = tx ?? db
  await runner.insert(emailOutbox).values({
    to: Array.isArray(email.to) ? email.to.join(", ") : email.to,
    subject: email.subject,
    html: email.html ?? null,
    text: email.text ?? null,
  })
}

function backoffMs(attempts: number): number {
  // 1 min, 2, 4, 8 … capped at 1 hour.
  return Math.min(60_000 * 2 ** (attempts - 1), 60 * 60_000)
}

/**
 * Send every due outbox row (up to `limit`). Claims rows under
 * `FOR UPDATE SKIP LOCKED`, so concurrent drains never double-send. Returns
 * counts for logging/tests.
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
  let requeued = 0

  for (const row of claimed) {
    try {
      await sendMail(
        {
          to: row.to,
          subject: row.subject,
          html: row.html ?? undefined,
          text: row.text ?? undefined,
        },
        { maxRetries: 0 },
      )
      // Success: `email_log` is the delivery record, so drop the queue row.
      await db.delete(emailOutbox).where(eq(emailOutbox.id, row.id))
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const attempts = row.attempts + 1
      const isFinal = attempts >= MAX_ATTEMPTS
      await db
        .update(emailOutbox)
        .set({
          status: isFinal ? "FAILED" : "PENDING",
          attempts,
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(
            Date.now() + backoffMs(attempts),
          ).toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(emailOutbox.id, row.id))
      if (isFinal) failed++
      else requeued++
    }
  }

  return { claimed: claimed.length, sent, failed, requeued }
}

/** Drain once and never throw — for use right after a domain commit. */
export async function flushEmailOutbox(limit = 20): Promise<void> {
  try {
    await drainEmailOutbox({ limit })
  } catch (err) {
    console.error("[email-outbox] flush failed:", err)
  }
}
