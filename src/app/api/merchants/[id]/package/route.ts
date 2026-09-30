import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant, merchantPackage, pricingPackage } from "@/lib/db/schema"
import { packageAssignSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * POST — SUPER_ADMIN assigns a package to a merchant directly, bypassing the
 * purchase-request flow (ops override / comped deal).
 *
 * Unlike approval of a purchase request, **no ledger row is written**: nothing
 * was paid, so there is no PAYMENT_CONFIRMED credit to record. Any bundle still
 * active is closed out first, so the merchant never holds two at once.
 */
export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const parsed = await parseBody(req, packageAssignSchema)
    if (parsed.error) return parsed.error
    const { packageId } = parsed.data

    return db.transaction(async (tx) => {
      const [pkg] = await tx
        .select({
          id: pricingPackage.id,
          name: pricingPackage.name,
          isActive: pricingPackage.isActive,
        })
        .from(pricingPackage)
        .where(eq(pricingPackage.id, packageId))
        .limit(1)
      if (!pkg) return notFound("Package not found")

      const [target] = await tx
        .select({ id: merchant.id, businessName: merchant.businessName })
        .from(merchant)
        .where(eq(merchant.id, id))
        .limit(1)
      if (!target) return notFound("Merchant not found")

      // Close out any bundle still active before starting the new one (the
      // partial unique index allows only one active bundle per merchant).
      await tx
        .update(merchantPackage)
        .set({ isActive: false, endedAt: new Date().toISOString() })
        .where(
          and(
            eq(merchantPackage.merchantId, id),
            eq(merchantPackage.isActive, true),
          ),
        )

      const [activated] = await tx
        .insert(merchantPackage)
        .values({
          merchantId: id,
          packageId: pkg.id,
          ordersUsed: 0,
          isActive: true,
          assignedBy: me.name,
        })
        .returning()

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "PACKAGE_ASSIGNED",
          entityType: "merchant",
          entityId: id,
          description: `Assigned package ${pkg.name} to ${target.businessName}`,
          metadata: { packageId: pkg.id, merchantPackageId: activated.id },
        },
        tx,
      )

      return NextResponse.json(activated, { status: 201 })
    })
  },
)
