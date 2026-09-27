import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { dbRead } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { parseBody, userPasswordSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"
import { authErrorResponse } from "../../auth-error"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const parsed = await parseBody(req, userPasswordSchema)
    if (parsed.error) return parsed.error

    const { id } = await params
    const [target] = await dbRead
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    if (!target) return notFound("User not found")

    try {
      await auth.api.setUserPassword({
        body: { userId: target.id, newPassword: parsed.data.password },
        headers: req.headers,
      })
    } catch (err) {
      logger.error("setUserPassword failed", { err })
      return authErrorResponse(err, "Could not set the user's password.")
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "USER_PASSWORD_RESET",
      entityType: "user",
      entityId: target.id,
      description: `Reset password for ${target.email}`,
      metadata: { target: target.email },
    })

    return NextResponse.json({ id: target.id })
  },
)
