import { and, inArray, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
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

  // Skip merchants that are already ACTIVE — the status predicate makes the
  // "read then write" of the single route unnecessary here (ROADMAP P1.1).
  const updated = await db
    .update(merchant)
    .set({ status: "ACTIVE" })
    .where(and(inArray(merchant.id, ids), ne(merchant.status, "ACTIVE")))
    .returning()

  await logAuditMany(
    updated.map((m) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_REACTIVATED",
      entityType: "merchant",
      entityId: m.id,
      description: `Reactivated merchant ${m.businessName}`,
    })),
  )

  return NextResponse.json({ ok: true, count: updated.length })
})
