import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { twoFactor, user } from "@/lib/db/schema"
import { parseBody, twoFactorDisableSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// Better Auth rejects a bad second factor by throwing its own APIError — any
// other exception (a dropped connection, a bad column) is a real failure and
// must surface as a 500 instead of "invalid code".
function isApiError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "APIError"
  )
}

/**
 * Better Auth's own `/two-factor/disable` endpoint re-prompts for the account
 * password. Per ROADMAP H4 the disable action instead demands a *current*
 * second factor, so this route verifies one through the plugin's server API
 * (TOTP first, then a recovery code) and only then removes the enrolment.
 */
async function verifySecondFactor(code: string, hdrs: Headers) {
  try {
    await auth.api.verifyTOTP({ body: { code }, headers: hdrs })
    return true
  } catch (err) {
    if (!isApiError(err)) throw err
  }
  try {
    await auth.api.verifyBackupCode({ body: { code }, headers: hdrs })
    return true
  } catch (err) {
    if (!isApiError(err)) throw err
    return false
  }
}

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const parsed = await parseBody(req, twoFactorDisableSchema)
  if (parsed.error) return parsed.error

  const [enrolment] = await dbRead
    .select({ id: twoFactor.id })
    .from(twoFactor)
    .where(eq(twoFactor.userId, me.userId))
    .limit(1)
  if (!enrolment) {
    return NextResponse.json(
      { error: "Two-factor authentication is not enabled." },
      { status: 400 },
    )
  }

  const valid = await verifySecondFactor(parsed.data.code, await headers())
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid verification code." },
      { status: 401 },
    )
  }

  await db
    .update(user)
    .set({ twoFactorEnabled: false, updatedAt: new Date().toISOString() })
    .where(eq(user.id, me.userId))
  await db.delete(twoFactor).where(eq(twoFactor.userId, me.userId))

  return NextResponse.json({ status: true })
})
