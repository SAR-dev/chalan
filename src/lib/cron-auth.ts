import { createHash, timingSafeEqual } from "node:crypto"
import { logger } from "@/lib/logger"

/**
 * Constant-time string comparison. Hashes both sides to a fixed width first
 * so `timingSafeEqual` never throws on length mismatch and response timing
 * does not reveal the secret's length.
 */
function safeEqual(a: string, b: string): boolean {
  const aHash = createHash("sha256").update(a).digest()
  const bHash = createHash("sha256").update(b).digest()
  return timingSafeEqual(aHash, bHash)
}

/**
 * Verifies the `Authorization: Bearer <CRON_SECRET>` header for cron job
 * routes. Comparison is timing-safe so a direct actor cannot distinguish a
 * wrong-length secret from a wrong-value one.
 *
 * Returns `false` (→ 401) when the secret is not configured or the header is
 * missing/mismatched, and logs a warning when the server is misconfigured so
 * operators notice instead of silently skipping cleanup.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    logger.error("CRON_SECRET is not set")
    return false
  }
  const auth = req.headers.get("authorization")
  const provided = auth?.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : ""
  return safeEqual(secret, provided)
}
