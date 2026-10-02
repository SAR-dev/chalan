import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import {
  merchantPackage,
  packagePurchaseRequest,
  pricingPackage,
  pricingPackageTier,
} from "@/lib/db/schema"
import { packageUpsertSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Package catalogue.
 *
 * GET  — SUPER_ADMIN sees every package (including inactive); a MERCHANT sees
 *        only active packages, plus their own active bundle and latest purchase
 *        request so the catalogue can render "already active" / "awaiting
 *        review" / "declined" states.
 * POST — SUPER_ADMIN only, create a package (tiers are added separately).
 */
export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "MERCHANT") return forbidden()

  // Merchants only ever see published packages, so filter in SQL rather than
  // fetching the whole catalogue and discarding rows in JS.
  const visible = await dbRead
    .select()
    .from(pricingPackage)
    .where(
      me.role === "SUPER_ADMIN" ? undefined : eq(pricingPackage.isActive, true),
    )
    .orderBy(asc(pricingPackage.name))

  const tiers =
    visible.length === 0
      ? []
      : await dbRead
          .select()
          .from(pricingPackageTier)
          .where(
            inArray(
              pricingPackageTier.packageId,
              visible.map((p) => p.id),
            ),
          )
          .orderBy(
            asc(pricingPackageTier.sortOrder),
            asc(pricingPackageTier.orderCount),
          )

  let activePackage: typeof merchantPackage.$inferSelect | null = null
  let latestRequest: typeof packagePurchaseRequest.$inferSelect | null = null

  if (me.role === "MERCHANT" && me.merchantId) {
    const [active] = await dbRead
      .select()
      .from(merchantPackage)
      .where(
        and(
          eq(merchantPackage.merchantId, me.merchantId),
          eq(merchantPackage.isActive, true),
        ),
      )
      .limit(1)
    activePackage = active ?? null

    // Most recent request decides what the merchant sees: an approval explains
    // the price paid on the active bundle, a rejection shows its reason, and a
    // pending request blocks a new one. Oldest-first would strand merchants on
    // a long-settled APPROVED row.
    const [request] = await dbRead
      .select()
      .from(packagePurchaseRequest)
      .where(eq(packagePurchaseRequest.merchantId, me.merchantId))
      .orderBy(desc(packagePurchaseRequest.requestedAt))
      .limit(1)
    latestRequest = request ?? null
  }

  // Package catalogue: changes rarely, and every merchant fetches it on
  // Load.
  return NextResponse.json(
    {
      packages: visible.map((p) => ({
        ...p,
        tiers: tiers.filter((t) => t.packageId === p.id),
      })),
      activePackage,
      latestRequest,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  )
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, packageUpsertSchema)
  if (parsed.error) return parsed.error

  const [created] = await db
    .insert(pricingPackage)
    .values({
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      price: parsed.data.price,
      isActive: parsed.data.isActive ?? true,
      createdBy: me.name,
    })
    .returning()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "PACKAGE_CREATED",
    entityType: "pricing_package",
    entityId: created.id,
    description: `Created package ${created.name} at ${created.price} Tk`,
    metadata: { price: created.price, isActive: created.isActive },
  })

  return NextResponse.json(created, { status: 201 })
})
