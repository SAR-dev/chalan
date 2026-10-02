import { createHash, timingSafeEqual } from "node:crypto"
import { noteCronInvocation } from "@/lib/cron-heartbeat"
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
  const authorized = safeEqual(secret, provided)
  // Only an authenticated call counts as the job actually running, so a dead
  // scheduler — or a leaked secret — cannot make the heartbeat look healthy.
  // Recorded here rather than in each of the six routes so no route can forget
  // To report in.
  if (authorized) noteCronInvocation(req)
  return authorized
}
