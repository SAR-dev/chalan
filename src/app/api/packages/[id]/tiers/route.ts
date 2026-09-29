import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { pricingPackage, pricingPackageTier } from "@/lib/db/schema"
import {
  packageTierUpsertSchema,
  parseBody,
  validateTierRule,
} from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id: packageId } = await params

    const parsed = await parseBody(req, packageTierUpsertSchema)
    if (parsed.error) return parsed.error

    const { orderCount, ruleType, ruleValue, sortOrder } = parsed.data

    const ruleError = validateTierRule(ruleType, ruleValue)
    if (ruleError) return badRequest(ruleError)

    const [pkg] = await db
      .select({ id: pricingPackage.id, name: pricingPackage.name })
      .from(pricingPackage)
      .where(eq(pricingPackage.id, packageId))
      .limit(1)

    if (!pkg) return notFound("Package not found")

    // The unique index on (packageId, orderCount) is the hard guarantee; this
    // check just turns the violation into a readable 400.
    const existing = await db
      .select({ orderCount: pricingPackageTier.orderCount })
      .from(pricingPackageTier)
      .where(eq(pricingPackageTier.packageId, packageId))

    if (existing.some((t) => t.orderCount === orderCount)) {
      return badRequest(
        `A tier for ${orderCount} orders already exists on this package.`,
      )
    }

    const [created] = await db
      .insert(pricingPackageTier)
      .values({
        packageId,
        orderCount,
        ruleType,
        ruleValue,
        sortOrder: sortOrder ?? orderCount,
      })
      .returning()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PACKAGE_TIER_CREATED",
      entityType: "pricing_package_tier",
      entityId: created.id,
      description: `Added tier ${orderCount} orders to ${pkg.name}: ${ruleType} ${ruleValue}`,
      metadata: { packageId, orderCount, ruleType, ruleValue },
    })

    return NextResponse.json(created, { status: 201 })
  },
)
