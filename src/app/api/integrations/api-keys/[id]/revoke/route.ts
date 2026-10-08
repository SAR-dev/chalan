import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { apiKey } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Revoke, not delete. The row survives so an incident review can still see that
 * the key existed and when it was last used. A revoked key is rejected even
 * though the hash still matches.
 */
export const POST = withErrorHandler(async (_req: Request, { params }: Ctx) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

  const { id } = await params
  const [row] = await dbRead
    .select({
      id: apiKey.id,
      merchantId: apiKey.merchantId,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.id, id))
    .limit(1)
  if (!row) return notFound("API key not found")
  if (row.merchantId !== me.merchantId) return notFound("API key not found")
  if (row.revokedAt !== null) {
    return NextResponse.json({ ok: true, alreadyRevoked: true })
  }

  await db
    .update(apiKey)
    .set({
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(apiKey.id, id), eq(apiKey.merchantId, me.merchantId)))

  return NextResponse.json({ ok: true })
})
