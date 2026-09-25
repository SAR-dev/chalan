import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { dbRead } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"
import { authErrorResponse } from "../../auth-error"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const [target] = await dbRead
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    if (!target) return notFound("User not found")

    try {
      await auth.api.unbanUser({
        body: { userId: target.id },
        headers: req.headers,
      })
    } catch (err) {
      console.error("[admin/users] unbanUser failed:", err)
      return authErrorResponse(err, "Could not unban the user.")
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "USER_UNBANNED",
      entityType: "user",
      entityId: target.id,
      description: `Unbanned ${target.email}`,
      metadata: { target: target.email },
    })

    return NextResponse.json({ id: target.id, banned: false })
  },
)
