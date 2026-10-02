import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Short-lived signed upload tokens.
 *
 * The rider-application NID upload happens before the applicant has an account,
 * so the upload endpoint cannot rely on a session. Instead the client first
 * asks the rate-limited `POST /api/uploads/token` endpoint for a short-lived
 * HMAC token and presents it with the upload. This bounds anonymous uploads to
 * the token endpoint's rate limit and gives a single place to revoke/expire the
 * capability.
 *
 * Format: `<scope>.<expiresAtEpochSeconds>.<hmacSha256Hex>`
 */

export type UploadTokenScope = "nids"

const DEFAULT_TTL_SECONDS = 15 * 60

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) {
    throw new Error("BETTER_AUTH_SECRET is required to sign upload tokens.")
  }
  return value
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex")
}

export function createUploadToken(
  scope: UploadTokenScope,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { token: string; expiresAt: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${scope}.${expiresAt}`
  return {
    token: `${payload}.${sign(payload)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

export function verifyUploadToken(
  token: string | null | undefined,
  scope: UploadTokenScope,
): boolean {
  if (!token) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false
  const [tokenScope, expiresRaw, signature] = parts
  if (tokenScope !== scope) return false

  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt)) return false
  if (expiresAt < Math.floor(Date.now() / 1000)) return false

  const expected = sign(`${tokenScope}.${expiresRaw}`)
  if (signature.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}
