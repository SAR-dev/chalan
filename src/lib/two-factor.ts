// =============================================================================
// Two-factor authentication helpers (ROADMAP H4).
//
// Pure, client-safe logic shared by the dashboard / warehouse shells (the
// enforcement gate), the account settings 2FA card, and their specs. Server
// concerns (reading the platform-config flag, verifying codes) live in the API
// routes — keep this module free of server-only imports so both shells can
// bundle it.
// =============================================================================

/** Roles offered 2FA enrollment (and covered by the require toggle). */
export const ADMIN_TWO_FACTOR_ROLES = [
  "SUPER_ADMIN",
  "WAREHOUSE_ADMIN",
] as const

export type AdminTwoFactorRole = (typeof ADMIN_TWO_FACTOR_ROLES)[number]

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_TWO_FACTOR_ROLES.includes(role as AdminTwoFactorRole)
}

/** Where a given admin role enrolls in 2FA (their own account page). */
export function twoFactorAccountPath(
  role: string | null | undefined,
): string | null {
  if (role === "SUPER_ADMIN") return "/dashboard/account"
  if (role === "WAREHOUSE_ADMIN") return "/warehouse/account"
  return null
}

/**
 * Returns the setup URL when an admin still has to enroll, or null when
 * nothing should happen (toggle off, already enrolled, not an admin, or
 * already sitting on the account page).
 */
export function twoFactorEnforcementPath(input: {
  role: string | null | undefined
  twoFactorEnabled: boolean | null | undefined
  twoFactorRequired: boolean | null | undefined
  pathname: string
}): string | null {
  if (input.twoFactorRequired !== true) return null
  if (input.twoFactorEnabled === true) return null
  const accountPath = twoFactorAccountPath(input.role)
  if (!accountPath) return null
  if (
    input.pathname === accountPath ||
    input.pathname.startsWith(`${accountPath}/`)
  ) {
    return null
  }
  return `${accountPath}?setup=2fa`
}

/**
 * Pulls the base32 TOTP secret out of the otpauth:// URI returned by
 * Better Auth's `twoFactor.enable` (there is no QR renderer in this repo —
 * the secret is shown as copyable text instead).
 */
export function totpSecretFromUri(totpUri: string): string | null {
  try {
    const secret = new URL(totpUri).searchParams.get("secret")
    if (secret) return secret
  } catch {
    // fall through to the regex below
  }
  const match = /[?&]secret=([^&]+)/.exec(totpUri)
  return match?.[1] ?? null
}
