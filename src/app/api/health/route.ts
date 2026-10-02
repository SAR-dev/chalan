// Lightweight liveness endpoint used by the Docker HEALTHCHECK.
// Returns 200 as soon as the Next.js server is accepting requests.
// No auth, no DB query — intentionally minimal so it responds fast
// and doesn't produce noise in audit or access logs.
//
// `rateLimiter` reports whether the rate limiter is running degraded
// (production without REDIS_URL → per-instance limits). Liveness
// still reports 200: a config problem should be visible, not fatal.
import { NextResponse } from "next/server"
import { rateLimiterDegraded } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  return NextResponse.json({
    ok: true,
    rateLimiter: { degraded: rateLimiterDegraded() },
  })
})
