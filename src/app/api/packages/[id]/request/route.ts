import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import {
  merchantPackage,
  packagePurchaseRequest,
  pricingPackage,
} from "@/lib/db/schema"
import { packageRequestSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

    const { id: packageId } = await params
    const merchantId = me.merchantId

    const { data, error } = await parseBody(req, packageRequestSchema)
    if (error) return error
    const note = data.note?.trim() || undefined

    const response = await db.transaction(async (tx) => {
      // One request awaiting review at a time — matches the one-pending-payment
      // rule on the top-up flow.
      const [pending] = await tx
        .select({ id: packagePurchaseRequest.id })
        .from(packagePurchaseRequest)
        .where(
          and(
            eq(packagePurchaseRequest.merchantId, merchantId),
            eq(packagePurchaseRequest.status, "PENDING"),
          ),
        )
        .limit(1)

      if (pending) {
        return conflict("You already have a package request awaiting review.")
      }

      // A merchant cannot stack bundles on top of an active one — the current
      // bundle has to be exhausted or ended first.
      const [active] = await tx
        .select({ id: merchantPackage.id })
        .from(merchantPackage)
        .where(
          and(
            eq(merchantPackage.merchantId, merchantId),
            eq(merchantPackage.isActive, true),
          ),
        )
        .limit(1)

      if (active) {
        return conflict(
          "You already have an active package. It must be used up or ended before requesting another.",
        )
      }

      const [pkg] = await tx
        .select({
          id: pricingPackage.id,
          name: pricingPackage.name,
          price: pricingPackage.price,
          isActive: pricingPackage.isActive,
        })
        .from(pricingPackage)
        .where(eq(pricingPackage.id, packageId))
        .limit(1)

      if (!pkg) return notFound("Package not found")
      if (!pkg.isActive)
        return badRequest("This package is no longer available.")

      const [created] = await tx
        .insert(packagePurchaseRequest)
        .values({
          merchantId,
          packageId: pkg.id,
          // Snapshot the price so a later package price change cannot alter what
          // this request is worth.
          amount: pkg.price,
          status: "PENDING",
          note,
        })
        .returning()

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "PACKAGE_REQUESTED",
          entityType: "package_purchase_request",
          entityId: created.id,
          description: `Requested package ${pkg.name} for ${pkg.price} Tk`,
          metadata: { packageId: pkg.id, amount: pkg.price },
        },
        tx,
      )

      return NextResponse.json(created, { status: 201 })
    })

    return response
  },
)
