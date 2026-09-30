import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import {
  balanceTransaction,
  merchantBalance,
  merchantPackage,
  packagePurchaseRequest,
} from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { packageRequestReviewSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id: requestId } = await params

    const limited = await rateLimitByIp(req, "package-request-review", 30, 60)
    if (limited) return limited

    const { data, error } = await parseBody(req, packageRequestReviewSchema)
    if (error) return error

    const approve = data.action === "approve"
    const rejectReason = approve ? null : data.reason.trim()

    const result = await db.transaction(async (tx) => {
      // Lock the request so two admins cannot both approve it.
      const [current] = await tx
        .select({
          id: packagePurchaseRequest.id,
          merchantId: packagePurchaseRequest.merchantId,
          packageId: packagePurchaseRequest.packageId,
          amount: packagePurchaseRequest.amount,
          status: packagePurchaseRequest.status,
        })
        .from(packagePurchaseRequest)
        .where(eq(packagePurchaseRequest.id, requestId))
        .for("update")
        .limit(1)

      if (!current) return notFound("Request not found")
      if (current.status !== "PENDING") {
        return conflict("This request has already been reviewed.")
      }

      if (!approve) {
        const [rejected] = await tx
          .update(packagePurchaseRequest)
          .set({
            status: "REJECTED",
            reviewedBy: me.name,
            reviewedAt: new Date().toISOString(),
            rejectReason,
          })
          .where(eq(packagePurchaseRequest.id, requestId))
          .returning()

        await logAudit(
          {
            actor: { userId: me.userId, name: me.name, role: me.role },
            action: "PACKAGE_REQUEST_REJECTED",
            entityType: "package_purchase_request",
            entityId: requestId,
            description: `Rejected package request ${requestId} for merchant ${current.merchantId}`,
            metadata: { rejectReason, amount: current.amount },
          },
          tx,
        )

        return NextResponse.json(rejected)
      }

      // Approve: close out any bundle that is somehow still active, then start
      // the new one with a fresh quota.
      await tx
        .update(merchantPackage)
        .set({ isActive: false, endedAt: new Date().toISOString() })
        .where(
          and(
            eq(merchantPackage.merchantId, current.merchantId),
            eq(merchantPackage.isActive, true),
          ),
        )

      const [activated] = await tx
        .insert(merchantPackage)
        .values({
          merchantId: current.merchantId,
          packageId: current.packageId,
          ordersUsed: 0,
          isActive: true,
          assignedBy: me.name,
        })
        .returning()

      const [approved] = await tx
        .update(packagePurchaseRequest)
        .set({
          status: "APPROVED",
          reviewedBy: me.name,
          reviewedAt: new Date().toISOString(),
        })
        .where(eq(packagePurchaseRequest.id, requestId))
        .returning()

      // Credit the merchant's wallet for the prepaid package. `amount` is a
      // credit, so the ledger row is negative — same sign convention as a
      // confirmed top-up.
      const credit = -Math.abs(current.amount)
      await tx.insert(balanceTransaction).values({
        merchantId: current.merchantId,
        type: "PAYMENT_CONFIRMED",
        amount: credit,
        status: "SETTLED",
        note: `Package purchase approved (${requestId})`,
        paymentMethod: "PACKAGE",
        paymentAccount: activated.id,
        reviewedBy: me.name,
        reviewedAt: new Date().toISOString(),
        createdBy: me.userId,
      })

      await tx
        .insert(merchantBalance)
        .values({ merchantId: current.merchantId, balance: credit })
        .onConflictDoUpdate({
          target: merchantBalance.merchantId,
          set: {
            balance: sql`${merchantBalance.balance} + ${credit}`,
            updatedAt: new Date().toISOString(),
          },
        })

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "PACKAGE_REQUEST_APPROVED",
          entityType: "package_purchase_request",
          entityId: requestId,
          description: `Approved package purchase of ${Math.abs(credit)} Tk for merchant ${current.merchantId}`,
          metadata: {
            merchantPackageId: activated.id,
            packageId: current.packageId,
            amount: current.amount,
          },
        },
        tx,
      )

      return NextResponse.json({
        request: approved,
        merchantPackage: activated,
      })
    })

    return result
  },
)
