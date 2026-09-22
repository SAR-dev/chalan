import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { deliveryCity, pickupLocation } from "@/lib/db/schema"
import { paginateResponse, parsePagination } from "@/lib/pagination"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { parseBody, pickupLocationSchema } from "@/lib/validation"

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req)
  const merchantId = new URL(req.url).searchParams.get("merchantId")
  const effectiveMerchantId =
    me.role === "MERCHANT" ? me.merchantId : merchantId

  const where = effectiveMerchantId
    ? eq(pickupLocation.merchantId, effectiveMerchantId)
    : undefined

  let q = dbRead
    .select({
      id: pickupLocation.id,
      merchantId: pickupLocation.merchantId,
      label: pickupLocation.label,
      address: pickupLocation.address,
      cityId: pickupLocation.cityId,
      mapLink: pickupLocation.mapLink,
      createdAt: pickupLocation.createdAt,
      updatedAt: pickupLocation.updatedAt,
    })
    .from(pickupLocation)
    .$dynamic()
  if (where) q = q.where(where)
  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    dbRead
      .select({ count: sql<number>`count(*)` })
      .from(pickupLocation)
      .where(where),
    q,
  ])

  // Pickup locations change rarely — allow short-lived browser caching to
  // avoid a round-trip on repeat navigation.
  return NextResponse.json(paginateResponse(rows, count, limit, offset), {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  })
}

// Merchant registers a new pickup location (shop) for their own business.
export async function POST(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden()
  }

  const limited = rateLimit(`pickup-locations:${getClientIp(req)}`, 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, pickupLocationSchema)
  if (parsed.error) return parsed.error
  const { label, address, cityId, mapLink } = parsed.data

  // Validate the city exists and is active.
  const [city] = await db
    .select({ id: deliveryCity.id, isActive: deliveryCity.isActive })
    .from(deliveryCity)
    .where(eq(deliveryCity.id, cityId))
    .limit(1)
  if (!city) {
    return badRequest("The selected city does not exist.")
  }
  if (!city.isActive) {
    return badRequest("The selected city is no longer active. Contact support.")
  }

  const [created] = await db
    .insert(pickupLocation)
    .values({
      merchantId: me.merchantId,
      label: label.trim(),
      address: address.trim(),
      cityId,
      mapLink: mapLink?.trim() ? mapLink.trim() : null,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
