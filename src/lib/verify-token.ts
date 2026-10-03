import { createHash, randomBytes } from "node:crypto"

// =============================================================================
// Merchant email-verification tokens.
//
// The token used to be stored in plaintext in `merchant.emailVerificationToken`
// and compared directly, so anyone with read access to the table (a dump, a
// backup, an over-broad admin query) could verify an arbitrary merchant's email
// — the exact reason the staff activation tokens in `lib/activation.ts` are
// hashed. Same treatment here: the raw token exists only inside the emailed
// link, the table holds its SHA-256 hash.
// =============================================================================

export const VERIFY_TOKEN_TTL_HOURS = 24

export function hashVerifyToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export interface IssuedVerifyToken {
  raw: string
  hash: string
  expiresAt: string
}

/** Fresh single-use token: raw (emailed), hash (stored), expiry. */
export function issueVerifyToken(): IssuedVerifyToken {
  const raw = randomBytes(32).toString("hex")
  return {
    raw,
    hash: hashVerifyToken(raw),
    expiresAt: new Date(
      Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString(),
  }
}

/** The public link the merchant clicks. Only the raw token goes in the URL. */
export function verifyTokenUrl(raw: string, siteUrl?: string): string {
  const base =
    siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  return `${base}/api/auth/verify-email?token=${encodeURIComponent(raw)}`
}
