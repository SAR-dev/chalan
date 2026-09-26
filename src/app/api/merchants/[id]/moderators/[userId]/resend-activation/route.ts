import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { issueActivationToken, sendActivationEmail } from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { hasNavPermission } from "@/lib/nav-config"
import { withErrorHandler } from "@/lib/with-error-handler"

/** Owner re-sends (or re-issues) a PENDING moderator's activation email —
 *  overwrites any previously sent token so the old link dies. */
export const POST = withErrorHandler(
  async (
    _req: Request,
    { params }: { params: Promise<{ id: string; userId: string }> },
  ) => {
    const { id, userId } = await params
    const me = await requireSession()
    if (!me) return unauthorized()
    if (
      me.role !== "MERCHANT" ||
      me.merchantId !== id ||
      !hasNavPermission(me, "/merchant/settings")
    ) {
      return forbidden()
    }

    const [target] = await dbRead
      .select({
        activatedAt: profile.activatedAt,
        name: user.name,
        email: user.email,
        businessName: merchant.businessName,
      })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId))
      .innerJoin(merchant, eq(merchant.id, profile.merchantId))
      .where(
        and(
          eq(profile.userId, userId),
          eq(profile.merchantId, id),
          eq(profile.isModerator, true),
        ),
      )
      .limit(1)
    if (!target) return notFound("Moderator not found")
    if (target.activatedAt) {
      return badRequest("This account is already activated.")
    }

    const rawToken = await issueActivationToken(userId)
    await sendActivationEmail({
      to: target.email,
      userName: target.name,
      contextName: target.businessName,
      rawToken,
    })

    return NextResponse.json({ ok: true })
  },
)
