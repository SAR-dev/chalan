import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { pricingPackageTier } from "@/lib/db/schema"
import {
  packageTierUpsertSchema,
  parseBody,
  validateTierRule,
} from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (
    req: Request,
    { params }: { params: Promise<{ id: string; tierId: string }> },
  ) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id: packageId, tierId } = await params

    const parsed = await parseBody(req, packageTierUpsertSchema.partial())
    if (parsed.error) return parsed.error

    const [before] = await db
      .select()
      .from(pricingPackageTier)
      .where(
        and(
          eq(pricingPackageTier.id, tierId),
          eq(pricingPackageTier.packageId, packageId),
        ),
      )
      .limit(1)

    if (!before) return notFound("Tier not found")

    const nextRuleType = parsed.data.ruleType ?? before.ruleType
    const nextRuleValue = parsed.data.ruleValue ?? before.ruleValue
    const ruleError = validateTierRule(nextRuleType, nextRuleValue)
    if (ruleError) return badRequest(ruleError)

    // The unique index on (packageId, orderCount) is the hard guarantee; this
    // check just turns the violation into a readable 400.
    if (parsed.data.orderCount !== undefined) {
      const clash = await db
        .select({ id: pricingPackageTier.id })
        .from(pricingPackageTier)
        .where(
          and(
            eq(pricingPackageTier.packageId, packageId),
            eq(pricingPackageTier.orderCount, parsed.data.orderCount),
          ),
        )

      if (clash.some((t) => t.id !== tierId)) {
        return badRequest(
          `A tier for ${parsed.data.orderCount} orders already exists on this package.`,
        )
      }
    }

    const [updated] = await db
      .update(pricingPackageTier)
      .set({
        ...(parsed.data.orderCount !== undefined && {
          orderCount: parsed.data.orderCount,
        }),
        ...(parsed.data.ruleType !== undefined && {
          ruleType: parsed.data.ruleType,
        }),
        ...(parsed.data.ruleValue !== undefined && {
          ruleValue: parsed.data.ruleValue,
        }),
        ...(parsed.data.sortOrder !== undefined && {
          sortOrder: parsed.data.sortOrder,
        }),
      })
      .where(eq(pricingPackageTier.id, tierId))
      .returning()

    const diff = diffEntity(before, updated, [
      "orderCount",
      "ruleType",
      "ruleValue",
      "sortOrder",
    ])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PACKAGE_TIER_UPDATED",
      entityType: "pricing_package_tier",
      entityId: tierId,
      description: `Updated tier to ${updated.orderCount} orders: ${updated.ruleType} ${updated.ruleValue}`,
      metadata: diff ? { diff } : null,
    })

    return NextResponse.json(updated)
  },
)

export const DELETE = withErrorHandler(
  async (
    _req: Request,
    { params }: { params: Promise<{ id: string; tierId: string }> },
  ) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id: packageId, tierId } = await params

    const [tier] = await db
      .select()
      .from(pricingPackageTier)
      .where(
        and(
          eq(pricingPackageTier.id, tierId),
          eq(pricingPackageTier.packageId, packageId),
        ),
      )
      .limit(1)

    if (!tier) return notFound("Tier not found")

    await db.delete(pricingPackageTier).where(eq(pricingPackageTier.id, tierId))

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PACKAGE_TIER_DELETED",
      entityType: "pricing_package_tier",
      entityId: tierId,
      description: `Deleted tier ${tier.orderCount} orders (${tier.ruleType} ${tier.ruleValue}) from package ${packageId}`,
      metadata: { packageId, orderCount: tier.orderCount },
    })

    return NextResponse.json({ ok: true })
  },
)
