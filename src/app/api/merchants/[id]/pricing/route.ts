import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantPricingSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const parsed = await parseBody(req, merchantPricingSchema)
    if (parsed.error) return parsed.error
    const {
      baseRate,
      extraRatePerKg,
      freeWeightKg,
      maxWeightKg,
      cancellationFee,
    } = parsed.data

    const [current] = await db
      .select({
        baseRate: merchant.baseRate,
        extraRatePerKg: merchant.extraRatePerKg,
        freeWeightKg: merchant.freeWeightKg,
        maxWeightKg: merchant.maxWeightKg,
        cancellationFee: merchant.cancellationFee,
      })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()

    const [updated] = await db
      .update(merchant)
      .set({
        baseRate,
        extraRatePerKg,
        freeWeightKg,
        maxWeightKg,
        ...(cancellationFee !== undefined ? { cancellationFee } : {}),
      })
      .where(eq(merchant.id, id))
      .returning()

    if (!updated) return notFound()

    const diff = diffEntity(current, updated, [
      "baseRate",
      "extraRatePerKg",
      "freeWeightKg",
      "maxWeightKg",
      "cancellationFee",
    ])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_PRICING_UPDATED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Updated pricing for merchant ${updated.businessName}`,
      metadata: diff ? { diff } : null,
    })

    return NextResponse.json(updated)
  },
)
