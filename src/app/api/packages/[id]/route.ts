import { count, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import {
  merchantPackage,
  packagePurchaseRequest,
  pricingPackage,
} from "@/lib/db/schema"
import { packageUpsertSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const parsed = await parseBody(req, packageUpsertSchema.partial())
    if (parsed.error) return parsed.error

    const [before] = await db
      .select()
      .from(pricingPackage)
      .where(eq(pricingPackage.id, id))
      .limit(1)

    if (!before) return notFound("Package not found")

    const [updated] = await db
      .update(pricingPackage)
      .set({
        ...(parsed.data.name !== undefined && {
          name: parsed.data.name.trim(),
        }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description.trim() || null,
        }),
        ...(parsed.data.price !== undefined && { price: parsed.data.price }),
        ...(parsed.data.isActive !== undefined && {
          isActive: parsed.data.isActive,
        }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pricingPackage.id, id))
      .returning()

    const diff = diffEntity(before, updated, [
      "name",
      "description",
      "price",
      "isActive",
    ])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PACKAGE_UPDATED",
      entityType: "pricing_package",
      entityId: id,
      description: `Updated package ${updated.name}`,
      metadata: diff ? { diff } : null,
    })

    return NextResponse.json(updated)
  },
)

/**
 * DELETE — archive-if-referenced, hard-delete otherwise.
 *
 * `merchant_package` and `package_purchase_request` FK the package with
 * `restrict`, so a package that was ever bought or assigned cannot be removed
 * without breaking the financial trail. Deleting one of those gets archived
 * (`isActive: false`) instead: it disappears from the merchant catalogue while
 * every price snapshot, ledger row, and bundle stays intact. A package nobody
 * has ever touched is removed outright.
 */
export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const [pkg] = await db
      .select()
      .from(pricingPackage)
      .where(eq(pricingPackage.id, id))
      .limit(1)

    if (!pkg) return notFound("Package not found")

    const [{ bundles }, { requests }] = await Promise.all([
      db
        .select({ bundles: count() })
        .from(merchantPackage)
        .where(eq(merchantPackage.packageId, id))
        .then((r) => r[0]),
      db
        .select({ requests: count() })
        .from(packagePurchaseRequest)
        .where(eq(packagePurchaseRequest.packageId, id))
        .then((r) => r[0]),
    ])

    if (bundles > 0 || requests > 0) {
      const [archived] = await db
        .update(pricingPackage)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(pricingPackage.id, id))
        .returning()

      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PACKAGE_ARCHIVED",
        entityType: "pricing_package",
        entityId: id,
        description: `Archived package ${archived.name} (still referenced by ${bundles} bundle(s) and ${requests} request(s))`,
        metadata: { bundles, requests },
      })

      return NextResponse.json({ archived: true, package: archived })
    }

    // Tiers cascade with the package; orders only had `set null` links, and
    // their price snapshots live on the order row itself.
    await db.delete(pricingPackage).where(eq(pricingPackage.id, id))

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PACKAGE_DELETED",
      entityType: "pricing_package",
      entityId: id,
      description: `Deleted package ${pkg.name}`,
      metadata: { price: pkg.price },
    })

    return NextResponse.json({ deleted: true })
  },
)
