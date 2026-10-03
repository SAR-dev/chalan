import { randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Public tracking token.
 *
 * Orders are identified internally by a **sequential** code (`ORD-100001E`),
 * which is guessable and therefore unsafe as the authorization for public
 * actions. The tracking token is a separate 128-bit random value that:
 *
 *   - forms the public tracking URL (`/track/<token>`), and
 *   - authorizes the public receiver-note write.
 *
 * The sequential code stays available for human-facing flows (typing it into
 * the tracking search, printing it on parcels), but it grants read-only access.
 */

/** 32 lowercase hex characters (128 bits of entropy). */
export function generateTrackingToken(): string {
  return randomBytes(16).toString("hex")
}

/**
 * Constant-time comparison of a candidate token against the stored one.
 * Returns false for a missing stored token or a length mismatch so callers
 * can respond identically for "unknown order" and "wrong token".
 */
export function trackingTokensMatch(
  stored: string | null | undefined,
  candidate: string,
): boolean {
  if (!stored || candidate.length !== stored.length) return false
  try {
    return timingSafeEqual(Buffer.from(stored), Buffer.from(candidate))
  } catch {
    return false
  }
}
