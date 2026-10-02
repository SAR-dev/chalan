import { and, inArray, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  // Only merchants that are not already suspended are transitioned, so the
  // reported count is honest and a concurrent change is not overwritten
  const updated = await db
    .update(merchant)
    .set({ status: "SUSPENDED" })
    .where(and(inArray(merchant.id, ids), ne(merchant.status, "SUSPENDED")))
    .returning()

  await logAuditMany(
    updated.map((m) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_SUSPENDED",
      entityType: "merchant",
      entityId: m.id,
      description: `Suspended merchant ${m.businessName}`,
    })),
  )

  refreshStats(statTag("merchant"))

  return NextResponse.json({ ok: true, count: updated.length })
})
