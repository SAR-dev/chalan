import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { zoneDeliveryTime } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Deleting a lane's delivery time puts it back to "no estimate" rather than
 * leaving a wrong number in place — an admin correcting a fat-fingered 30 to a
 * 3 should not have to guess whether clearing it is even possible.
 */
export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const [deleted] = await db
      .delete(zoneDeliveryTime)
      .where(eq(zoneDeliveryTime.id, id))
      .returning()
    if (!deleted) return notFound("Delivery time not found")

    return NextResponse.json({ ok: true })
  },
)
