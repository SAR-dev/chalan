import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantPricingSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { id } = await params
  const parsed = await parseBody(req, merchantPricingSchema)
  if (parsed.error) return parsed.error
  const { baseRate, extraRatePerKg, freeWeightKg, maxWeightKg } = parsed.data

  const [updated] = await db
    .update(merchant)
    .set({ baseRate, extraRatePerKg, freeWeightKg, maxWeightKg })
    .where(eq(merchant.id, id))
    .returning()

  if (!updated) return notFound()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "MERCHANT_PRICING_UPDATED",
    entityType: "merchant",
    entityId: updated.id,
    description: `Updated pricing for merchant ${updated.businessName}`,
    metadata: { baseRate, extraRatePerKg, freeWeightKg, maxWeightKg },
  })

  return NextResponse.json(updated)
})

