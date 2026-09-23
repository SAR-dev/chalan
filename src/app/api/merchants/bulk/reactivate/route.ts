import { inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const updated = await db
    .update(merchant)
    .set({ status: "ACTIVE" })
    .where(inArray(merchant.id, ids))
    .returning()

  await Promise.all(
    updated.map((m) =>
      logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "MERCHANT_REACTIVATED",
        entityType: "merchant",
        entityId: m.id,
        description: `Reactivated merchant ${m.businessName}`,
      }),
    ),
  )

  return NextResponse.json({ ok: true, count: updated.length })
}
