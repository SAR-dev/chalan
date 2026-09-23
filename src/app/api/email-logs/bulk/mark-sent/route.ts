import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const faileds = await db
    .select({
      id: emailLog.id,
      to: emailLog.to,
      subject: emailLog.subject,
      status: emailLog.status,
    })
    .from(emailLog)
    .where(and(inArray(emailLog.id, ids), eq(emailLog.status, "FAILED")))

  if (faileds.length === 0) {
    return badRequest("No FAILED entries found for the given IDs.")
  }

  const failedIds = faileds.map((l) => l.id)
  await db
    .update(emailLog)
    .set({
      status: "SENT",
      markedSentBy: me.name,
      markedSentAt: new Date().toISOString(),
    })
    .where(inArray(emailLog.id, failedIds))

  await Promise.all(
    faileds.map((l) =>
      logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "EMAIL_LOG_MARKED_SENT",
        entityType: "email_log",
        entityId: l.id,
        description: `Marked email to ${l.to} ("${l.subject}") as sent`,
      }),
    ),
  )

  return NextResponse.json({ ok: true, count: faileds.length })
}
