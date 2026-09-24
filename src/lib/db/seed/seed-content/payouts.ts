import { MERCHANT_IDS } from "./merchants"
import { SEED_ORDERS } from "./orders"
import { ADMIN_USER_NAMES } from "./users"

// ---------------------------------------------------------------------------
// Deterministic: Payout Requests (2)
// ---------------------------------------------------------------------------
export interface PayoutRequestSeedEntry {
  id: string
  merchantId: string
  orderIds: string[]
  amount: number
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED"
  payoutMethod: string
  payoutDetails: string
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectReason: string | null
  paidAt: string | null
}

function buildSeedPayoutRequests(): PayoutRequestSeedEntry[] {
  // Pick 2 delivered orders from merchant1 for payout
  const merchant1Delivered = SEED_ORDERS.filter(
    (o) => o.merchantId === MERCHANT_IDS.merchant1 && o.status === "DELIVERED",
  )
  const payoutOrder1 = merchant1Delivered[0]
  const payoutOrder2 = merchant1Delivered[1]

  const now = Date.now()
  const DAY = 86_400_000

  return [
    {
      id: "PR-100001E",
      merchantId: MERCHANT_IDS.merchant1,
      orderIds: payoutOrder1 ? [payoutOrder1.id] : [],
      amount: payoutOrder1 ? payoutOrder1.merchantEarnings : 60,
      status: "PENDING",
      payoutMethod: "bKash",
      payoutDetails: "01712345678",
      requestedAt: new Date(now - 2 * DAY).toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null,
      paidAt: null,
    },
    {
      id: "PR-100002E",
      merchantId: MERCHANT_IDS.merchant1,
      orderIds: payoutOrder2 ? [payoutOrder2.id] : [],
      amount: payoutOrder2 ? payoutOrder2.merchantEarnings : 70,
      status: "APPROVED",
      payoutMethod: "Nagad",
      payoutDetails: "01812345678",
      requestedAt: new Date(now - 5 * DAY).toISOString(),
      reviewedBy: ADMIN_USER_NAMES.nadia,
      reviewedAt: new Date(now - 3 * DAY).toISOString(),
      rejectReason: null,
      paidAt: null,
    },
  ]
}

export const SEED_PAYOUT_REQUESTS: PayoutRequestSeedEntry[] =
  buildSeedPayoutRequests()
