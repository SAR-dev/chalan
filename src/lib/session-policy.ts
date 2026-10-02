// =============================================================================
// Server-side session policy.
//
// Both rules used to live in the browser only: `ADMIN_2FA_REQUIRED` was
// enforced by a redirect in the dashboard/warehouse shells, and merchant email
// verification was a client-side check in `use-auth.tsx`. Either could be
// skipped by calling an API route directly. This module is the pure decision
// function that `requireSession()` runs on every authenticated request, so the
// browser can no longer grant access the server would refuse.
//
// Kept free of server-only imports so the shells, the client account gates and
// the specs can all share it.
// =============================================================================

import { isAdminRole } from "@/lib/two-factor"

export type SessionBlockReason =
  | "BANNED"
  | "TWO_FACTOR_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | null

export interface SessionPolicyInput {
  role: string | null | undefined
  /** `user.banned` — an admin ban is a hard stop, not a redirect. */
  banned?: boolean | null
  /** `user.twoFactorEnabled` — true once the admin has a working second factor. */
  twoFactorEnabled?: boolean | null
  /** `merchant.emailVerifiedAt` — null while the merchant owner is unverified. */
  emailVerifiedAt?: string | Date | null
  /** Deployment policy: `ADMIN_2FA_REQUIRED=1`, resolved by the caller. */
  twoFactorRequired?: boolean
}

/**
 * Which policy (if any) blocks this session. `null` means "allow".
 *
 * Banned users are blocked for every role. The 2FA rule only covers admin
 * roles — merchants and riders may opt in but are never forced. The email rule
 * only covers merchants, whose owner must confirm the address before the
 * business can transact.
 */
export function sessionBlockReason(
  input: SessionPolicyInput,
): SessionBlockReason {
  if (input.banned === true) return "BANNED"
  if (
    isAdminRole(input.role) &&
    input.twoFactorRequired === true &&
    input.twoFactorEnabled !== true
  ) {
    return "TWO_FACTOR_REQUIRED"
  }
  if (input.role === "MERCHANT" && !input.emailVerifiedAt) {
    return "EMAIL_VERIFICATION_REQUIRED"
  }
  return null
}

/** True when the deployment forces 2FA for admin roles (`ADMIN_2FA_REQUIRED=1`). */
export function isTwoFactorRequiredByPolicy(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.ADMIN_2FA_REQUIRED === "1"
}
