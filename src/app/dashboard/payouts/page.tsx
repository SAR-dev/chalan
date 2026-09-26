import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { payoutRequest } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { PayoutsPageClient } from "./payouts-client"

export default async function PayoutsPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], rows, stats] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(payoutRequest),
    dbRead
      .select({
        id: payoutRequest.id,
        merchantId: payoutRequest.merchantId,
        amount: payoutRequest.amount,
        status: payoutRequest.status,
        orderIds: payoutRequest.orderIds,
        payoutMethod: payoutRequest.payoutMethod,
        payoutDetails: payoutRequest.payoutDetails,
        rejectReason: payoutRequest.rejectReason,
        requestedAt: payoutRequest.requestedAt,
        reviewedBy: payoutRequest.reviewedBy,
        reviewedAt: payoutRequest.reviewedAt,
        paidAt: payoutRequest.paidAt,
      })
      .from(payoutRequest)
      .orderBy(desc(payoutRequest.requestedAt))
      .limit(limit),
    dbRead
      .select({
        status: payoutRequest.status,
        count: sql<number>`count(*)::int`,
      })
      .from(payoutRequest)
      .groupBy(payoutRequest.status),
  ])

  const statMap = Object.fromEntries(stats.map((s) => [s.status, s.count]))

  return (
    <PayoutsPageClient
      initialData={rows}
      initialTotal={total}
      initialCounts={{
        pending: statMap.PENDING ?? 0,
        approved: statMap.APPROVED ?? 0,
        paid: statMap.PAID ?? 0,
        rejected: statMap.REJECTED ?? 0,
      }}
    />
  )
}
