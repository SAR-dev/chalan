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
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { flushEmailOutbox } from "@/lib/email-outbox"
import {
  hasActiveMailConfig,
  MAIL_NOT_CONFIGURED_MESSAGE,
} from "@/lib/mail-config"
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

    if (!(await hasActiveMailConfig())) {
      return badRequest(MAIL_NOT_CONFIGURED_MESSAGE)
    }

    // Token re-issue + outbox row commit together (ROADMAP P1.5).
    await db.transaction(async (tx) => {
      const rawToken = await issueActivationToken(userId, tx)
      await sendActivationEmail(
        {
          to: target.email,
          userName: target.name,
          contextName: target.businessName,
          rawToken,
        },
        tx,
      )
    })
    await flushEmailOutbox()

    return NextResponse.json({ ok: true })
  },
)
