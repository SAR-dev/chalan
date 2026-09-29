import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { dbRead } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { parseBody, userBanSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"
import { authErrorResponse } from "../../auth-error"

const SECONDS_PER_DAY = 24 * 60 * 60

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const parsed = await parseBody(req, userBanSchema)
    if (parsed.error) return parsed.error

    const { id } = await params
    const [target] = await dbRead
      .select({ id: user.id, email: user.email, role: profile.role })
      .from(user)
      .innerJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, id))
      .limit(1)
    if (!target) return notFound("User not found")
    if (target.id === me.userId) {
      return badRequest("Cannot ban your own account")
    }
    // A SUPER_ADMIN banning a peer SUPER_ADMIN is a denial-of-administration
    // vector (an attacker with one admin account could lock out the rest), so
    // peer admins are off limits.
    if (target.role === "SUPER_ADMIN") {
      return forbidden("Super admin accounts cannot be banned")
    }

    const { reason, expiresInDays } = parsed.data

    try {
      await auth.api.banUser({
        body: {
          userId: target.id,
          banReason: reason,
          ...(expiresInDays !== undefined
            ? { banExpiresIn: expiresInDays * SECONDS_PER_DAY }
            : {}),
        },
        headers: req.headers,
      })
    } catch (err) {
      logger.error("banUser failed", { err })
      return authErrorResponse(err, "Could not ban the user.")
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "USER_BANNED",
      entityType: "user",
      entityId: target.id,
      description: `Banned ${target.email}`,
      metadata: {
        target: target.email,
        reason,
        expiresInDays: expiresInDays ?? null,
      },
    })

    return NextResponse.json({ id: target.id, banned: true })
  },
)
