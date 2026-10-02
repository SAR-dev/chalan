import { eq, inArray, notInArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { sumMoneyFiltered } from "@/lib/db/money-sql"
import { order } from "@/lib/db/schema"
import type { MerchantOrderSummary, OrderStatus } from "@/lib/types"
import { withErrorHandler } from "@/lib/with-error-handler"

// Headline figures for the merchant overview, computed over the merchant's
// *entire* order history rather than one page of it (ROADMAP R0.1).
//
// The dashboard used to derive all four stat cards client-side from the array
// `useOrders()` returns — which is one `DEFAULT_TABLE_ROWS_PER_PAGE` (20) rows.
// A merchant with 400 delivered orders was shown the earnings of the newest 20,
// with no `serverPaginated` total to expose the truncation, so the number
// looked authoritative and was simply wrong. These aggregates are the fix.

/** Statuses the "In progress" tab groups together. Mirrors
 *  `IN_PROGRESS_STATUSES` in src/app/merchant/page.tsx. */
const IN_PROGRESS_STATUSES: OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
]

/** Statuses that mean no COD is still to be collected. Mirrors the
 *  exclusion list the dashboard used to apply client-side. */
const NO_COD_REMAINING: OrderStatus[] = [
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
  "FAILED_ATTEMPT",
]

const EMPTY: MerchantOrderSummary = {
  codToCollect: 0,
  inProgressCount: 0,
  codToSettleCount: 0,
  codToSettleAmount: 0,
  payoutReadyCount: 0,
  payoutToIssue: 0,
  deliveredCount: 0,
  totalEarnings: 0,
}

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const requestedMerchantId = new URL(req.url).searchParams
    .get("merchantId")
    ?.trim()

  // A merchant reads only their own summary; an id in the query string must not
  // let them (or any non-admin) read another merchant's money. Only
  // SUPER_ADMIN may look up an arbitrary merchant.
  let merchantId: string | null
  if (me.role === "MERCHANT") {
    if (requestedMerchantId && requestedMerchantId !== me.merchantId) {
      return forbidden()
    }
    merchantId = me.merchantId ?? null
  } else if (me.role === "SUPER_ADMIN") {
    merchantId = requestedMerchantId ?? null
  } else {
    return forbidden()
  }

  if (!merchantId) return NextResponse.json(EMPTY)

  // Every condition below is evaluated as a FILTER clause over one pass of the
  // merchant's rows (served by order_merchant_status_created_at_idx), rather
  // than a count per figure.
  const delivered = eq(order.status, "DELIVERED")
  const codToSettle = sql`${delivered} and ${order.codSettledAt} is null`
  const payoutReady = sql`${delivered} and ${order.codSettledAt} is not null and ${order.payoutRequestId} is null`
  const paidOut = sql`${delivered} and ${order.payoutRequestId} is not null`

  const [row] = await db
    .select({
      inProgressCount: sql<number>`count(*) filter (where ${inArray(order.status, IN_PROGRESS_STATUSES)})::int`,
      codToCollect: sumMoneyFiltered(
        order.productCost,
        notInArray(order.status, NO_COD_REMAINING),
      ),
      codToSettleCount: sql<number>`count(*) filter (where ${codToSettle})::int`,
      codToSettleAmount: sumMoneyFiltered(order.productCost, codToSettle),
      payoutReadyCount: sql<number>`count(*) filter (where ${payoutReady})::int`,
      payoutToIssue: sumMoneyFiltered(order.merchantEarnings, payoutReady),
      deliveredCount: sql<number>`count(*) filter (where ${delivered})::int`,
      totalEarnings: sumMoneyFiltered(order.merchantEarnings, paidOut),
    })
    .from(order)
    .where(eq(order.merchantId, merchantId))

  return NextResponse.json({
    codToCollect: Number(row?.codToCollect ?? 0),
    inProgressCount: row?.inProgressCount ?? 0,
    codToSettleCount: row?.codToSettleCount ?? 0,
    codToSettleAmount: Number(row?.codToSettleAmount ?? 0),
    payoutReadyCount: row?.payoutReadyCount ?? 0,
    payoutToIssue: Number(row?.payoutToIssue ?? 0),
    deliveredCount: row?.deliveredCount ?? 0,
    totalEarnings: Number(row?.totalEarnings ?? 0),
  } satisfies MerchantOrderSummary)
})
