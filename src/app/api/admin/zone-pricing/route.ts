import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { parseBody, zonePricingCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (
req: Request
) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "WAREHOUSE_ADMIN") {
    return forbidden()
  }

  const url = new URL(req.url)
  const fromZoneId = url.searchParams.get("fromZoneId")?.trim()

  const where = fromZoneId ? eq(zonePricing.fromZoneId, fromZoneId) : undefined

  const rows = await db
    .select()
    .from(zonePricing)
    .where(where)
    .orderBy(asc(zonePricing.fromZoneId), asc(zonePricing.toZoneId))

  return NextResponse.json(rows)
})


export const POST = withErrorHandler(async (
req: Request
) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, zonePricingCreateSchema)
  if (parsed.error) return parsed.error

  const { fromZoneId, toZoneId, ...pricing } = parsed.data

  // Upsert: if a row exists for this zone pair, update it; otherwise insert
  const existing = await db
    .select({ id: zonePricing.id })
    .from(zonePricing)
    .where(
      and(
        eq(zonePricing.fromZoneId, fromZoneId),
        eq(zonePricing.toZoneId, toZoneId),
      ),
    )
    .limit(1)

  let result
  if (existing.length > 0) {
    const [updated] = await db
      .update(zonePricing)
      .set({ ...pricing, updatedAt: new Date().toISOString() })
      .where(eq(zonePricing.id, existing[0].id))
      .returning()
    result = updated
  } else {
    const [created] = await db
      .insert(zonePricing)
      .values({ fromZoneId, toZoneId, ...pricing })
      .returning()
    result = created
  }

  return NextResponse.json(result, { status: existing.length > 0 ? 200 : 201 })
})

