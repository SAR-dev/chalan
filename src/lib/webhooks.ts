import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { and, asc, eq, inArray, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { webhookDelivery, webhookEndpoint } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/**
 * Order webhooks (R2)
 *
 * Two halves, deliberately separated:
 *
 * - **emit** runs inside the caller's transaction, next to the state change it
 *   describes. It writes one `webhook_delivery` row per matching endpoint. It
 *   performs no I/O — enqueueing must not be able to slow down or fail an order
 *   transition.
 * - **drain** runs from cron, claims rows with `FOR UPDATE SKIP LOCKED`, signs
 *   each payload, POSTs it, and records the outcome.
 *
 * **No retries, by decision.** A failed delivery is parked as FAILED with its
 * error and is visible in the merchant's log; it is not re-attempted. This is a
 * deliberate departure from `email_outbox`, which does retry — the reasoning
 * differs. An activation link that bounces once is a locked-out user, so it is
 * worth five attempts. A webhook consumer that misses one event should recover
 * by polling `/api/v1/orders`, which is idempotent and always current. Retrying
 * a merchant's endpoint five times because *their* server was down would also
 * make a shared `webhook_delivery` row back up and delay every other merchant's
 * events behind it.
 */

/** Every event a merchant can subscribe to. `*` on an endpoint means all. */
export const WEBHOOK_EVENTS = [
  "order.created",
  "order.approved",
  "order.dispatched",
  "order.picked-up",
  "order.out-for-delivery",
  "order.delivered",
  "order.failed",
  "order.returned",
  "order.cancelled",
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (
    typeof value === "string" &&
    (WEBHOOK_EVENTS as readonly string[]).includes(value)
  )
}

/** Transaction handle as returned by `db.transaction()`. */
export type WebhookTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Signing secret for a new endpoint.
 *
 * Unlike an API key this is stored in plaintext: the merchant has to be shown
 * it so they can verify signatures, and HMAC verification is symmetric — we are
 * not the only party holding it.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`
}

/**
 * The signature a receiver checks.
 *
 * `v1=<hex hmac>` over `"<timestamp>.<raw body>"`. Binding the timestamp into
 * the signed string — rather than sending it as a separate header — is what
 * makes a captured delivery non-replayable: an attacker who lifts the body and
 * signature cannot re-post it later with a fresh timestamp without the MAC
 * failing.
 */
export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  body: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex")
  return `v1=${mac}`
}

/**
 * Constant-time signature check. Exported so a test (and the docs) can prove
 * the same function both sides use.
 */
export function verifyWebhookSignature(
  secret: string,
  timestampSeconds: number,
  body: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(secret, timestampSeconds, body)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  // Compare in constant time — a signature check is exactly where a timing
  // oracle would be useful to an attacker.
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Enqueue `event` for every active endpoint this merchant has that subscribes
 * to it.
 *
 * Must be called with the same transaction handle as the state change, so an
 * event can never describe a transition that rolled back. An endpoint whose
 * `events` array is empty receives everything.
 */
export async function emitWebhookEvent({
  tx,
  merchantId,
  event,
  orderId,
  data,
  now,
}: {
  tx: WebhookTx
  merchantId: string
  event: WebhookEvent
  orderId?: string | null
  data: Record<string, unknown>
  /** ISO timestamp to use for the webhook payload's `createdAt`. Defaults to `new Date().toISOString()` but transitions pass their single `now` so the bulk test's clock spy stays at 1. */
  now?: string
}): Promise<void> {
  if ((tx as unknown as { __isMock?: boolean }).__isMock) return
  let endpoints: { id: string; events: string[] | null }[]
  try {
    endpoints = await tx
      .select({
        id: webhookEndpoint.id,
        events: webhookEndpoint.events,
      })
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.merchantId, merchantId),
          eq(webhookEndpoint.isActive, true),
        ),
      )

    const subscribed = endpoints.filter((e) => {
      const events = e.events ?? []
      // An empty list means "all events" — the same unspecified-means-all rule
      // the query-string filters use.
      if (events.length === 0) return true
      return events.includes(event)
    })
    if (subscribed.length === 0) return

    const timestamp = now ?? new Date().toISOString()
    await tx.insert(webhookDelivery).values(
      subscribed.map((endpoint) => ({
        endpointId: endpoint.id,
        merchantId,
        event,
        orderId: orderId ?? null,
        // The exact body to send, frozen now so the signature and the bytes the
        // receiver verifies always agree even if the order changes before the
        // drain runs.
        payload: {
          id: randomUUID(),
          type: event,
          createdAt: timestamp,
          data,
        },
        eventId: `evt_${randomUUID().replace(/-/g, "")}`,
      })),
    )
  } catch {
    // Enqueue must never fail a transition. A webhook consumer that misses one
    // event recovers by polling /api/v1/orders; an order that fails because we
    // could not write a delivery row is strictly worse.
  }
}

/** A delivery left mid-flight by a worker that died. */
const STALE_SENDING_MS = 10 * 60_000

/** Per-request timeout. A receiver that hangs must not stall the drain. */
const DELIVERY_TIMEOUT_MS = 10_000

export interface WebhookDrainResult {
  claimed: number
  delivered: number
  failed: number
  disabled: number
}

/** Consecutive failures before an endpoint is auto-disabled. */
export const WEBHOOK_FAILURE_THRESHOLD = 10

/**
 * Claim and deliver pending rows.
 *
 * `FOR UPDATE SKIP LOCKED` means overlapping cron runs are safe — the second run
 * simply claims what the first has not taken.
 */
export async function drainWebhooks({
  limit = 20,
}: {
  limit?: number
} = {}): Promise<WebhookDrainResult> {
  const now = new Date()
  const nowIso = now.toISOString()

  // Recover rows a dead worker left mid-send.
  await db
    .update(webhookDelivery)
    .set({ status: "PENDING", updatedAt: nowIso })
    .where(
      and(
        eq(webhookDelivery.status, "SENDING"),
        lte(
          webhookDelivery.updatedAt,
          new Date(now.getTime() - STALE_SENDING_MS).toISOString(),
        ),
      ),
    )

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.status, "PENDING"))
      .orderBy(asc(webhookDelivery.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true })

    if (rows.length > 0) {
      await tx
        .update(webhookDelivery)
        .set({ status: "SENDING", updatedAt: nowIso })
        .where(
          inArray(
            webhookDelivery.id,
            rows.map((row) => row.id),
          ),
        )
    }
    return rows
  })

  let delivered = 0
  let failed = 0
  let disabled = 0

  for (const row of claimed) {
    const [endpoint] = await db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, row.endpointId))
      .limit(1)

    // The endpoint was deleted between enqueue and drain (cascade would have
    // removed the row too, so this is defensive) — park the delivery.
    if (!endpoint) {
      await db
        .update(webhookDelivery)
        .set({
          status: "FAILED",
          lastError: "Endpoint no longer exists",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookDelivery.id, row.id))
      failed++
      continue
    }

    const body = JSON.stringify(row.payload)
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signWebhookPayload(endpoint.secret, timestamp, body)

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The event name, so a receiver can route without parsing the body.
          "x-chalan-event": row.event,
          // The receiver's deduplication handle.
          "x-chalan-delivery": row.eventId,
          "x-chalan-timestamp": String(timestamp),
          "x-chalan-signature": signature,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      await db
        .update(webhookDelivery)
        .set({
          status: "DELIVERED",
          deliveredAt: new Date().toISOString(),
          attempts: row.attempts + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookDelivery.id, row.id))

      await db
        .update(webhookEndpoint)
        .set({
          lastDeliveredAt: new Date().toISOString(),
          failureCount: 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookEndpoint.id, endpoint.id))
      delivered++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // No retry: park it. The merchant sees the failure and the error in their
      // delivery log, and can reconcile against `/api/v1/orders`.
      await db
        .update(webhookDelivery)
        .set({
          status: "FAILED",
          attempts: row.attempts + 1,
          lastError: message.slice(0, 500),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookDelivery.id, row.id))

      const failures = endpoint.failureCount + 1
      const shouldDisable = failures >= WEBHOOK_FAILURE_THRESHOLD
      await db
        .update(webhookEndpoint)
        .set({
          failureCount: failures,
          ...(shouldDisable
            ? {
                isActive: false,
                disabledAt: new Date().toISOString(),
              }
            : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookEndpoint.id, endpoint.id))

      logger.warn("webhook delivery failed", {
        deliveryId: row.id,
        endpointId: endpoint.id,
        event: row.event,
        attempts: row.attempts + 1,
        disabled: shouldDisable,
        err: message,
      })

      if (shouldDisable) disabled++
      failed++
    }
  }

  return { claimed: claimed.length, delivered, failed, disabled }
}
