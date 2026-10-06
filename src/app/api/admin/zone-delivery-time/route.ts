import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { zoneDeliveryTime } from "@/lib/db/schema"
import { parseBody, zoneDeliveryTimeCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "WAREHOUSE_ADMIN") {
    return forbidden()
  }

  const url = new URL(req.url)
  const fromZoneId = url.searchParams.get("fromZoneId")?.trim()

  const where = fromZoneId
    ? eq(zoneDeliveryTime.fromZoneId, fromZoneId)
    : undefined

  const rows = await dbRead
    .select()
    .from(zoneDeliveryTime)
    .where(where)
    .orderBy(asc(zoneDeliveryTime.fromZoneId), asc(zoneDeliveryTime.toZoneId))

  return NextResponse.json(rows)
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, zoneDeliveryTimeCreateSchema)
  if (parsed.error) return parsed.error

  const { fromZoneId, toZoneId, deliveryDays } = parsed.data
  const pair = and(
    eq(zoneDeliveryTime.fromZoneId, fromZoneId),
    eq(zoneDeliveryTime.toZoneId, toZoneId),
  )
  const set = { deliveryDays, updatedAt: new Date().toISOString() }

  // Update-first, insert-second, no read — the same race-safe shape
  // `zone-pricing` uses, for the same reason: the unique index on
  // (fromZoneId, toZoneId) makes the pair single-valued, and a
  // select-then-branch lets two concurrent saves both insert.
  const [updated] = await db
    .update(zoneDeliveryTime)
    .set(set)
    .where(pair)
    .returning()
  if (updated) return NextResponse.json(updated)

  const [created] = await db
    .insert(zoneDeliveryTime)
    .values({ fromZoneId, toZoneId, deliveryDays })
    .onConflictDoNothing()
    .returning()
  if (created) return NextResponse.json(created, { status: 201 })

  const [retried] = await db
    .update(zoneDeliveryTime)
    .set(set)
    .where(pair)
    .returning()
  if (!retried) {
    throw new Error("Zone delivery time write lost to a concurrent request")
  }
  return NextResponse.json(retried)
})
