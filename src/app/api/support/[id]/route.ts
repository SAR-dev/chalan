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
import { db } from "@/lib/db"
import { supportTicket } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, supportReplySchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const parsed = await parseBody(req, supportReplySchema)
    if (parsed.error) return parsed.error
    const { adminReply, status } = parsed.data

    const { id } = await params

    const limited = await rateLimitByIp(req, "support-reply", 20, 60)
    if (limited) return limited

    // Transaction: lock the ticket row for the guard + write so two concurrent
    // reply/close calls can't both pass the status check against stale state.
    const committed: {
      row: typeof supportTicket.$inferSelect | null
      replied: boolean
    } = { row: null, replied: false }

    const response = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: supportTicket.id,
          userId: supportTicket.userId,
          subject: supportTicket.subject,
          status: supportTicket.status,
          adminReply: supportTicket.adminReply,
        })
        .from(supportTicket)
        .where(eq(supportTicket.id, id))
        .for("update")
        .limit(1)

      if (!current) return notFound()

      if (me.role === "SUPER_ADMIN") {
        if (adminReply === undefined && status !== "CLOSED") {
          return badRequest("Provide a reply or close the ticket.")
        }
        const [updated] = await tx
          .update(supportTicket)
          .set({
            ...(adminReply !== undefined
              ? {
                  adminReply,
                  repliedAt: new Date().toISOString(),
                  repliedBy: me.name,
                }
              : {}),
            status: status === "CLOSED" ? "CLOSED" : "ANSWERED",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(supportTicket.id, id))
          .returning()

        committed.row = updated ?? null
        committed.replied = adminReply !== undefined
        return NextResponse.json(updated)
      }

      if (current.userId !== me.userId) return forbidden()
      if (adminReply !== undefined) {
        return forbidden("Only admins can reply to a ticket.")
      }
      if (status !== "CLOSED") {
        return badRequest("You can only close your own ticket.")
      }

      const [updated] = await tx
        .update(supportTicket)
        .set({ status: "CLOSED", updatedAt: new Date().toISOString() })
        .where(eq(supportTicket.id, id))
        .returning()

      return NextResponse.json(updated)
    })

    if (committed.row) {
      if (committed.replied) {
        await logAudit({
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "SUPPORT_REPLIED",
          entityType: "support_ticket",
          entityId: committed.row.id,
          description: `Replied to support ticket "${committed.row.subject}"`,
        })
      }
      if (committed.row.status === "CLOSED") {
        await logAudit({
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "SUPPORT_CLOSED",
          entityType: "support_ticket",
          entityId: committed.row.id,
          description: `Closed support ticket "${committed.row.subject}"`,
        })
      }
    }

    return response
  },
)
