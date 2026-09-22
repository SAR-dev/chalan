import type { Merchant } from "@/lib/types"

type VerificationCheck = {
  allowed: boolean
  reason?: string
}

export function canPlaceOrders(merchant: Merchant): VerificationCheck {
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
