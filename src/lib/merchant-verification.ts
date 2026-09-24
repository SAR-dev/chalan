import type { Merchant } from "@/lib/types"

type VerificationCheck = {
  allowed: boolean
  reason?: string
}

/**
 * Only these three merchant fields drive eligibility. Accepting them directly
 * (instead of a full `Merchant`) lets callers pass a Drizzle row projection
 * without resorting to `as any` or fetching an entire merchant row.
 */
export function canPlaceOrders(
  merchant: Pick<Merchant, "status" | "emailVerifiedAt" | "nidVerifiedAt">,
): VerificationCheck {
  if (merchant.status !== "ACTIVE") {
    return { allowed: false, reason: "Your account is not active yet." }
  }
  if (!merchant.emailVerifiedAt) {
    return { allowed: false, reason: "Please verify your email address first." }
  }
  if (!merchant.nidVerifiedAt) {
    return {
      allowed: false,
      reason: "Please upload and verify your NID first.",
    }
  }
  return { allowed: true }
}
