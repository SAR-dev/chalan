import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { conflict, notFound } from "@/lib/api-response"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { orderReceiverNoteSchema, parseBody } from "@/lib/validation"

// Public endpoint — no session required. The tracking page lets the recipient
// leave a note on their own parcel before it is delivered. Locked once the
// order reaches a terminal status (DELIVERED / RETURNED / CANCELLED).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const parsed = await parseBody(req, orderReceiverNoteSchema)
  if (parsed.error) return parsed.error

  const [orderRow] = await db
    .select({ id: order.id, status: order.status })
    .from(order)
    .where(eq(order.id, id))
    .limit(1)

  if (!orderRow) {
    return notFound("Order not found")
  }

  if (
    orderRow.status === "DELIVERED" ||
    orderRow.status === "RETURNED" ||
    orderRow.status === "CANCELLED"
  ) {
    return conflict("Cannot add a note to a completed order.")
  }

  const [updated] = await db
    .update(order)
    .set({ receiverNote: parsed.data.receiverNote.trim() })
    .where(eq(order.id, id))
    .returning()

  return NextResponse.json(updated)
}
