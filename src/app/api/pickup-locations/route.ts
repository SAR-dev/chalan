import { and, desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { db, dbRead } from "@/lib/db"
import { deliveryCity, pickupLocation, rider } from "@/lib/db/schema"
import { hasNavPermission } from "@/lib/nav-config"
import { paginateResponse, parsePagination } from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, pickupLocationSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })
  const merchantId = new URL(req.url).searchParams.get("merchantId")
  // Every non-SUPER_ADMIN role is scoped to what they may actually use:
  //   MERCHANT          → their own locations only.
  //   WAREHOUSE_ADMIN   → locations in their warehouse's cities (they may
  //                       still filter by ?merchantId within that scope).
  //   RIDER             → locations in their warehouse's cities (to resolve
  //                       shop addresses for assigned orders) — no merchant
  //                       targeting.
  //   SUPER_ADMIN       → everything, optional ?merchantId filter.
  // Riders/warehouse admins are additionally narrowed through the delivery
  // city (pickup_location.cityId → delivery_city.warehouseId) so they can
  // never enumerate pickup locations outside their own warehouse.
  let joinCity = false
  let where: ReturnType<typeof and> | ReturnType<typeof eq> | undefined

  switch (me.role) {
    case "MERCHANT": {
      if (!me.merchantId) return NextResponse.json(paginateResponse([], 0))
      where = eq(pickupLocation.merchantId, me.merchantId)
      break
    }
    case "WAREHOUSE_ADMIN": {
      if (!me.warehouseId) return NextResponse.json(paginateResponse([], 0))
      joinCity = true
      where = and(
        eq(deliveryCity.warehouseId, me.warehouseId),
        merchantId ? eq(pickupLocation.merchantId, merchantId) : undefined,
      )
      break
    }
    case "RIDER": {
      if (!me.riderId) return NextResponse.json(paginateResponse([], 0))
      const [riderRow] = await dbRead
        .select({ warehouseId: rider.warehouseId })
        .from(rider)
        .where(eq(rider.id, me.riderId))
        .limit(1)
      if (!riderRow) return NextResponse.json(paginateResponse([], 0))
      joinCity = true
      where = eq(deliveryCity.warehouseId, riderRow.warehouseId)
      break
    }
    default: {
      // SUPER_ADMIN — full visibility, optional merchant filter.
      where = merchantId ? eq(pickupLocation.merchantId, merchantId) : undefined
    }
  }

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
  let countQ = dbRead
    .select({ count: sql<number>`count(*)::int` })
    .from(pickupLocation)
    .$dynamic()
  if (joinCity) {
    q = q.innerJoin(deliveryCity, eq(pickupLocation.cityId, deliveryCity.id))
    countQ = countQ.innerJoin(
      deliveryCity,
      eq(pickupLocation.cityId, deliveryCity.id),
    )
  }
  if (where) {
    q = q.where(where)
    countQ = countQ.where(where)
  }
  // Stable default order so OFFSET paging cannot repeat or skip rows.
  q = q.orderBy(desc(pickupLocation.createdAt), desc(pickupLocation.id))
  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([countQ, q])

  // Pickup locations change rarely — allow short-lived browser caching to
  // avoid a round-trip on repeat navigation.
  return NextResponse.json(paginateResponse(rows, count, limit, offset), {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  })
})

// Merchant registers a new pickup location (shop) for their own business.
export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden()
  }
  // Pickup locations live under Business Settings, which is owner-only — a
  // Moderator never passes `hasNavPermission` for it.
  if (!hasNavPermission(me, "/merchant/settings")) {
    return forbidden("Only the account owner can manage pickup locations.")
  }

  const limited = await rateLimitByIp(req, "pickup-locations", 10, 60)
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
})
