import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantWeightLimitSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/** Super Admin sets a merchant's max parcel weight. Delivery/COD/cancellation
 *  fees come from zone pricing, not from per-merchant rates. */
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const parsed = await parseBody(req, merchantWeightLimitSchema)
    if (parsed.error) return parsed.error
    const { maxWeightKg } = parsed.data

    const [current] = await db
      .select({ maxWeightKg: merchant.maxWeightKg })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()

    const [updated] = await db
      .update(merchant)
      .set({ maxWeightKg })
      .where(eq(merchant.id, id))
      .returning()

    if (!updated) return notFound()

    const diff = diffEntity(current, updated, ["maxWeightKg"])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_PRICING_UPDATED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Updated weight limit for merchant ${updated.businessName}`,
      metadata: diff ? { diff } : null,
    })

    return NextResponse.json(updated)
  },
)
