import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [updated] = await db
      .update(merchant)
      .set({ status: "SUSPENDED" })
      .where(eq(merchant.id, id))
      .returning()

    if (!updated) return notFound()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_SUSPENDED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Suspended merchant ${updated.businessName}`,
    })

    return NextResponse.json(updated)
  },
)
