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
import { db, dbRead } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Single-log read. The list endpoint omits `body` / `textBody` (they are the
// bulk of the row payload), so the detail view fetches the full record here.
export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [log] = await dbRead
      .select()
      .from(emailLog)
      .where(eq(emailLog.id, id))
      .limit(1)

    if (!log) return notFound()
    return NextResponse.json(log)
  },
)

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({
        id: emailLog.id,
        to: emailLog.to,
        subject: emailLog.subject,
        status: emailLog.status,
      })
      .from(emailLog)
      .where(eq(emailLog.id, id))
      .limit(1)

    if (!current) return notFound()
    if (current.status !== "FAILED") {
      return badRequest("Only FAILED entries can be marked as sent.")
    }

    const [updated] = await db
      .update(emailLog)
      .set({
        status: "SENT",
        markedSentBy: me.name,
        markedSentAt: new Date().toISOString(),
      })
      .where(eq(emailLog.id, id))
      .returning()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "EMAIL_LOG_MARKED_SENT",
      entityType: "email_log",
      entityId: updated.id,
      description: `Marked email to ${updated.to} ("${updated.subject}") as sent`,
    })

    return NextResponse.json(updated)
  },
)
