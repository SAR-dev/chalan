import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { orderMerchantNoteSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// Authenticated endpoint — only the owning merchant can update their note.
// Locked once the order reaches a terminal status (DELIVERED / RETURNED / CANCELLED).
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    const parsed = await parseBody(req, orderMerchantNoteSchema)
    if (parsed.error) return parsed.error

    const [orderRow] = await db
      .select({
        id: order.id,
        status: order.status,
        merchantId: order.merchantId,
      })
      .from(order)
      .where(eq(order.id, id))
      .limit(1)

    if (!orderRow) {
      return notFound("Order not found")
    }

    if (me.role !== "SUPER_ADMIN" && orderRow.merchantId !== me.merchantId) {
      return forbidden("You can only update notes on your own orders.")
    }

    if (
      orderRow.status === "DELIVERED" ||
      orderRow.status === "RETURNED" ||
      orderRow.status === "CANCELLED"
    ) {
      return conflict("Cannot update a note on a completed order.")
    }

    const [updated] = await db
      .update(order)
      .set({ merchantNote: parsed.data.merchantNote.trim() })
      .where(eq(order.id, id))
      .returning()

    return NextResponse.json(updated)
  },
)
