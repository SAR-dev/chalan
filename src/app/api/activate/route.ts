import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import {
  activateAccount,
  countModeratorSlots,
  findUserByActivationToken,
} from "@/lib/activation"
import { badRequest } from "@/lib/api-response"
import { db } from "@/lib/db"
import { merchant, profile } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { activationSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// PUBLIC by design (allowlisted in route-auth-guard): the invitee has no
// session — the single-use, 24h token in the body IS the authorization.
// Shared by merchant moderators and warehouse-admin invites.
export const POST = withErrorHandler(async (req: Request) => {
  const limited = await rateLimitByIp(req, "activate", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, activationSchema)
  if (parsed.error) return parsed.error
  const { token, password } = parsed.data

  const userRow = await findUserByActivationToken(token)
  if (!userRow) {
    return badRequest("This activation link is invalid or has expired.")
  }

  const [profileRow] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userRow.id))
    .limit(1)
  if (!profileRow) {
    return badRequest("This activation link is invalid or has expired.")
  }
  if (profileRow.activatedAt) {
    return badRequest("This account is already activated.")
  }

  // Re-check the moderator quota at click time: the admin may have lowered
  // maxModerators after this invite went out. This invite's own slot is
  // excluded — it was reserved when the account was created.
  if (profileRow.isModerator) {
    if (!profileRow.merchantId) {
      return badRequest("This activation link is invalid or has expired.")
    }
    const [merchantRow] = await db
      .select({ maxModerators: merchant.maxModerators })
      .from(merchant)
      .where(eq(merchant.id, profileRow.merchantId))
      .limit(1)
    const max = merchantRow?.maxModerators ?? 0
    const used = await countModeratorSlots(profileRow.merchantId, userRow.id)
    if (used >= max) {
      return NextResponse.json(
        {
          error: `Moderator limit reached (${used}/${max}). Ask the merchant owner to free a slot before activating.`,
        },
        { status: 403 },
      )
    }
  }

  await activateAccount({ userId: userRow.id, password })

  return NextResponse.json({ ok: true })
})
