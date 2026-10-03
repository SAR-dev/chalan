import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
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

  const pendings = await db
    .select({ id: merchant.id })
    .from(merchant)
    .where(and(inArray(merchant.id, ids), eq(merchant.status, "PENDING")))

  if (pendings.length === 0) {
    return badRequest("No PENDING merchants found for the given IDs.")
  }

  const pendingIds = pendings.map((m) => m.id)
  // The status predicate is repeated on the write: between the read above and
  // this update a merchant may have been suspended or reactivated, and the
  // Write must not resurrect it.
  const updated = await db
    .update(merchant)
    .set({
      status: "ACTIVE",
      approvedBy: me.name,
      approvedAt: new Date().toISOString(),
    })
    .where(
      and(inArray(merchant.id, pendingIds), eq(merchant.status, "PENDING")),
    )
    .returning()

  await logAuditMany(
    updated.map((m) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_APPROVED",
      entityType: "merchant",
      entityId: m.id,
      description: `Approved merchant ${m.businessName}`,
    })),
  )

  refreshStats(statTag("merchant"))

  return NextResponse.json({ ok: true, count: updated.length })
})
