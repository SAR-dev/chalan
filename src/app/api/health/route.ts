// Lightweight liveness endpoint used by the Docker HEALTHCHECK.
// Returns 200 as soon as the Next.js server is accepting requests.
// No auth, no DB query — intentionally minimal so it responds fast
// and doesn't produce noise in audit or access logs.
import { NextResponse } from "next/server"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (

) => {
  return NextResponse.json({ ok: true })
})

