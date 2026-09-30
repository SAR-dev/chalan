import { NextResponse } from "next/server"
import { rateLimitByIp } from "@/lib/rate-limit"
import { createUploadToken } from "@/lib/upload-token"
import { withErrorHandler } from "@/lib/with-error-handler"

// PUBLIC by design (allowlisted in route-auth-guard): the rider-application
// NID upload happens before the applicant has an account. This endpoint issues
// a short-lived signed token that authorizes exactly that upload — the
// rate limit is what bounds anonymous use (ROADMAP P0.2).
export const POST = withErrorHandler(async (req: Request) => {
  // failClosed: with no resolvable client IP this endpoint would otherwise be
  // completely unthrottled, and it mints upload capability for anyone.
  const limited = await rateLimitByIp(req, "upload-token", 10, 60, {
    failClosed: true,
  })
  if (limited) return limited

  const { token, expiresAt } = createUploadToken("nids")
  return NextResponse.json({ token, expiresAt })
})
