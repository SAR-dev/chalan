import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { conflict, notFound } from "@/lib/api-response"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { trackingTokensMatch } from "@/lib/tracking-token"
import { orderReceiverNoteSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// Public endpoint — no session required. The tracking page lets the recipient
// leave a note on their own parcel before it is delivered. Authorization is the
// order's high-entropy **tracking token** (ROADMAP P0.1): the sequential order
// id is guessable, so it must never be enough to write. Locked once the order
// reaches a terminal status (DELIVERED / RETURNED / CANCELLED).
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params

    // Public unauthenticated write — throttle by IP as a second layer.
    // failClosed: an anonymous writer must not become unthrottled just because
    // the client IP could not be resolved.
    const limited = await rateLimitByIp(req, "receiver-note", 10, 60, {
      failClosed: true,
    })
    if (limited) return limited

    const parsed = await parseBody(req, orderReceiverNoteSchema)
    if (parsed.error) return parsed.error

    const [orderRow] = await db
      .select({
        id: order.id,
        status: order.status,
        trackingToken: order.trackingToken,
      })
      .from(order)
      .where(eq(order.id, id))
      .limit(1)

    // Unknown order and wrong token return the same 404 — no existence oracle.
    if (!orderRow) {
      return notFound("Order not found")
    }
    if (!trackingTokensMatch(orderRow.trackingToken, parsed.data.token)) {
      return notFound("Order not found")
    }

    if (
      orderRow.status === "DELIVERED" ||
      orderRow.status === "RETURNED" ||
      orderRow.status === "CANCELLED"
    ) {
      return conflict("Cannot add a note to a completed order.")
    }

    await db
      .update(order)
      .set({ receiverNote: parsed.data.receiverNote.trim() })
      .where(eq(order.id, id))

    // Minimal response: the public caller must never receive order PII.
    return NextResponse.json({ ok: true })
  },
)
