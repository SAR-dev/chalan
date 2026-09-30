import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { siteConfig } from "@/config/site"
import { issueActivationToken, sendActivationEmail } from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"
import { flushEmailOutbox } from "@/lib/email-outbox"
import {
  hasActiveMailConfig,
  MAIL_NOT_CONFIGURED_MESSAGE,
} from "@/lib/mail-config"
import { rateLimitByIp } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

/** Super Admin re-sends (re-issues) a PENDING team member's activation
 *  email — overwrites the previous token so the old link dies. */
export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    // Sends mail — throttle so a loop cannot spam an invitee's mailbox.
    const limited = await rateLimitByIp(req, "resend-activation", 5, 60)
    if (limited) return limited

    const { id } = await params
    const [target] = await dbRead
      .select({
        activatedAt: profile.activatedAt,
        name: user.name,
        email: user.email,
      })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId))
      .where(and(eq(profile.userId, id), eq(profile.role, "WAREHOUSE_ADMIN")))
      .limit(1)
    if (!target) return notFound("Team member not found")
    if (target.activatedAt) {
      return badRequest("This account is already activated.")
    }

    if (!(await hasActiveMailConfig())) {
      return badRequest(MAIL_NOT_CONFIGURED_MESSAGE)
    }

    // Token re-issue + outbox row commit together (ROADMAP P1.5).
    await db.transaction(async (tx) => {
      const rawToken = await issueActivationToken(id, tx)
      await sendActivationEmail(
        {
          to: target.email,
          userName: target.name,
          contextName: siteConfig.name,
          rawToken,
        },
        tx,
      )
    })
    await flushEmailOutbox()

    return NextResponse.json({ ok: true })
  },
)
