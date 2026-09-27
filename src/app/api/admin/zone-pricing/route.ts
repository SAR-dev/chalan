import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { parseBody, zonePricingCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
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

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, zonePricingCreateSchema)
  if (parsed.error) return parsed.error

  const { fromZoneId, toZoneId, ...pricing } = parsed.data
  const pair = and(
    eq(zonePricing.fromZoneId, fromZoneId),
    eq(zonePricing.toZoneId, toZoneId),
  )
  const set = { ...pricing, updatedAt: new Date().toISOString() }

  // Update-first, insert-second, no read: the old select-then-branch let two
  // concurrent saves for the same zone pair each insert a row, and order
  // pricing then picked an arbitrary one (ROADMAP P1.1). The unique index on
  // (fromZoneId, toZoneId) makes the pair single-valued, so:
  //   1. an existing row is updated (200),
  //   2. otherwise we try to insert (201),
  //   3. if we lost that race we update the row the winner just inserted.
  const [updated] = await db
    .update(zonePricing)
    .set(set)
    .where(pair)
    .returning()
  if (updated) return NextResponse.json(updated)

  const [created] = await db
    .insert(zonePricing)
    .values({ fromZoneId, toZoneId, ...pricing })
    .onConflictDoNothing()
    .returning()
  if (created) return NextResponse.json(created, { status: 201 })

  const [retried] = await db
    .update(zonePricing)
    .set(set)
    .where(pair)
    .returning()
  if (!retried) {
    throw new Error("Zone pricing write lost to a concurrent request")
  }
  return NextResponse.json(retried)
})
