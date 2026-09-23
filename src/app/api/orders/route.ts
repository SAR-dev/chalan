import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import {
  balanceTransaction,
  deliveryCity as deliveryCityTable,
  merchant,
  merchantBalance,
  order,
  pickupLocation,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import { canPlaceOrders } from "@/lib/merchant-verification"
import { paginateResponse, parseDateRange, parsePagination, parseSort, parseStatusFilter } from "@/lib/pagination"
import { calcCodFee, calcDeliveryCharge, calcMerchantEarnings } from "@/lib/pricing"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { orderCreateSchema, parseBody } from "@/lib/validation"

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  let where: SQL | undefined
  switch (me.role) {
    case "MERCHANT":
      if (!me.merchantId) return NextResponse.json(paginateResponse([], 0))
      where = eq(order.merchantId, me.merchantId)
      break
    case "RIDER":
      if (!me.riderId) return NextResponse.json(paginateResponse([], 0))
      where = or(
        eq(order.pickupRiderId, me.riderId),
        eq(order.deliveryRiderId, me.riderId),
      )
      break
    case "WAREHOUSE_ADMIN":
      if (!me.warehouseId) return NextResponse.json(paginateResponse([], 0))
      // Orders already logged into this warehouse, plus picked-up parcels
      // not yet assigned to any warehouse — these are the incoming
      // candidates any warehouse admin can receive (see app/warehouse/page.tsx).
      // Also include APPROVED orders without a pickup rider so warehouse
      // admins can assign one.
      where = or(
        eq(order.warehouseId, me.warehouseId),
        and(isNull(order.warehouseId), eq(order.status, "PICKED_UP")),
        and(isNull(order.pickupRiderId), eq(order.status, "APPROVED")),
      )
      break
    case "SUPER_ADMIN":
      where = undefined
      break
    default:
      return NextResponse.json(paginateResponse([], 0))
  }

  const search = new URL(req.url).searchParams.get("q")?.trim()
  if (search) {
    const likeQ = `%${search}%`
    // Use explicit LEFT JOINs instead of subselects so Postgres can plan
    // hash joins rather than potentially materialising correlated subqueries.
    const searchClause = or(
      ilike(order.id, likeQ),
      ilike(order.recipientName, likeQ),
      ilike(order.recipientPhone, likeQ),
      ilike(merchant.businessName, likeQ),
      ilike(warehouse.name, likeQ),
      ilike(warehouse.city, likeQ),
    )
    where = where ? and(where, searchClause) : searchClause
  }

  const statuses = parseStatusFilter(req)
  if (statuses.length > 0) {
    const statusClause = inArray(order.status, statuses as any)
    where = where ? and(where, statusClause) : statusClause
  }

  const dateRange = parseDateRange(req)
  if (dateRange) {
    const dateClause = and(
      gte(order.createdAt, dateRange.from.toISOString()),
      lte(order.createdAt, dateRange.to.toISOString()),
    )
    where = where ? and(where, dateClause) : dateClause
  }

  const { limit, offset } = parsePagination(req)

  // Lean projection for list view — omits wide/rarely-rendered columns such as
  // pickupProofRefs and the ~15 lifecycle timestamps.
  const listColumns = {
    id: order.id,
    merchantId: order.merchantId,
    warehouseId: order.warehouseId,
    pickupLocationId: order.pickupLocationId,
    pickupRiderId: order.pickupRiderId,
    deliveryRiderId: order.deliveryRiderId,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: deliveryCityTable.name,
    deliveryMapLink: order.deliveryMapLink,
    parcelWeightKg: order.parcelWeightKg,
    deliveryType: order.deliveryType,
    productCost: order.productCost,
    deliveryFee: order.deliveryFee,
    codFee: order.codFee,
    merchantEarnings: order.merchantEarnings,
    status: order.status,
    merchantNote: order.merchantNote,
    codSettledAt: order.codSettledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    merchantPhone: merchant.phone,
    pickupLocationMapLink: pickupLocation.mapLink,
  }

  // Build the base query with LEFT JOINs so the search clause can reference
  // merchant/warehouse columns directly without subselects.
  let dbQuery = dbRead
    .select(listColumns)
    .from(order)
    .leftJoin(merchant, eq(order.merchantId, merchant.id))
    .leftJoin(warehouse, eq(order.warehouseId, warehouse.id))
    .leftJoin(pickupLocation, eq(order.pickupLocationId, pickupLocation.id))
    .leftJoin(deliveryCityTable, eq(order.deliveryCityId, deliveryCityTable.id))
    .$dynamic()
  if (where) dbQuery = dbQuery.where(where)

  // COUNT only needs JOINs when the search clause references merchant/warehouse columns.
  const countQuery = search
    ? dbRead
        .select({ count: sql<number>`count(*)` })
        .from(order)
        .leftJoin(merchant, eq(order.merchantId, merchant.id))
        .leftJoin(warehouse, eq(order.warehouseId, warehouse.id))
        .where(where)
    : dbRead.select({ count: sql<number>`count(*)` }).from(order).where(where)

  const sortColumnMap = {
    order: order.id,
    city: deliveryCityTable.name,
    weight: order.parcelWeightKg,
    parcelWeight: order.parcelWeightKg,
    collectible: order.productCost,
    status: order.status,
    createdAt: order.createdAt,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    dbQuery =
      sort.direction === "asc"
        ? dbQuery.orderBy(asc(sort.column))
        : dbQuery.orderBy(desc(sort.column))
  }

  if (limit !== undefined) dbQuery = dbQuery.limit(limit)
  if (offset !== undefined) dbQuery = dbQuery.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([countQuery, dbQuery])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
}

export async function POST(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can create orders")
  }

  const merchantId = me.merchantId

  const limited = rateLimit(`orders:${getClientIp(req)}`, 30, 60)
  if (limited) return limited

  const parsed = await parseBody(req, orderCreateSchema)
  if (parsed.error) return parsed.error
  const {
    pickupLocationId,
    recipientName,
    recipientPhone,
    deliveryAddress,
    deliveryMapLink,
    parcelWeightKg,
    deliveryType,
    productCost,
    merchantNote,
  } = parsed.data

  const normalizedMapLink = deliveryMapLink?.trim()
    ? deliveryMapLink.trim()
    : null

  const [pickup] = await db
    .select({ warehouseId: deliveryCityTable.warehouseId })
    .from(pickupLocation)
    .innerJoin(
      deliveryCityTable,
      eq(pickupLocation.cityId, deliveryCityTable.id),
    )
    .where(eq(pickupLocation.id, pickupLocationId))
    .limit(1)
  if (!pickup?.warehouseId) {
    return badRequest("Pickup location has no warehouse assigned.")
  }
  const [hub] = await db
    .select({ id: warehouse.id, isActive: warehouse.isActive })
    .from(warehouse)
    .where(eq(warehouse.id, pickup.warehouseId))
    .limit(1)
  if (!hub || !hub.isActive) {
    return badRequest("No active warehouse available for this pickup location.")
  }

  const [merchantRow] = await db
    .select({
      id: merchant.id,
      status: merchant.status,
      emailVerifiedAt: merchant.emailVerifiedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
      baseRate: merchant.baseRate,
      extraRatePerKg: merchant.extraRatePerKg,
      freeWeightKg: merchant.freeWeightKg,
      maxWeightKg: merchant.maxWeightKg,
      codFeePercentage: merchant.codFeePercentage,
    })
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .limit(1)

  if (!merchantRow) {
    return notFound("Merchant not found")
  }
  if (merchantRow.status !== "ACTIVE") {
    return badRequest(
      merchantRow.status === "PENDING"
        ? "Your merchant account is not active yet."
        : "Your merchant account is suspended and cannot create orders.",
    )
  }
  const verification = canPlaceOrders(merchantRow as any)
  if (!verification.allowed) {
    return forbidden(verification.reason)
  }
  if (parcelWeightKg > merchantRow.maxWeightKg) {
    return badRequest(
      `Parcel weight exceeds the ${merchantRow.maxWeightKg} KG limit.`,
    )
  }

  // ── Zone-to-zone pricing lookup ──
  // 1. Destination zone from delivery city
  const destCityId = parsed.data.deliveryCityId
  const [destCity] = destCityId
    ? await dbRead
        .select({ zoneId: deliveryCityTable.zoneId })
        .from(deliveryCityTable)
        .where(eq(deliveryCityTable.id, destCityId))
        .limit(1)
    : []

  // 2. Origin zone from warehouse's city
  const [origWarehouse] = await dbRead
    .select({ city: warehouse.city })
    .from(warehouse)
    .where(eq(warehouse.id, hub.id))
    .limit(1)

  const [origCity] = origWarehouse?.city
    ? await dbRead
        .select({ zoneId: deliveryCityTable.zoneId })
        .from(deliveryCityTable)
        .where(eq(deliveryCityTable.name, origWarehouse.city))
        .limit(1)
    : []

  // 3. Look up zone-to-zone pricing (use merchant pricing as base, override with zone)
  type PricingInput = {
    baseRate: number
    extraRatePerKg: number
    freeWeightKg: number
    maxWeightKg: number
    codFeePercentage?: number | null
  }
  let pricing: PricingInput = merchantRow
  if (origCity?.zoneId && destCity?.zoneId) {
    const [zonePrice] = await dbRead
      .select()
      .from(zonePricing)
      .where(
        and(
          eq(zonePricing.fromZoneId, origCity.zoneId),
          eq(zonePricing.toZoneId, destCity.zoneId),
        ),
      )
      .limit(1)
    if (zonePrice) {
      pricing = zonePrice
    }
  }

  const { total: deliveryFee } = calcDeliveryCharge(pricing, parcelWeightKg)
  const codFee = calcCodFee(
    productCost,
    pricing.codFeePercentage ?? merchantRow.codFeePercentage ?? 1,
  )
  const merchantEarnings = calcMerchantEarnings(
    productCost,
    deliveryFee,
    codFee,
  )

  const [newOrder] = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(order)
      .values({
        merchantId,
        pickupLocationId,
        warehouseId: hub.id,
        recipientName,
        recipientPhone,
        deliveryCityId: destCityId ?? null,
        deliveryAddress,
        deliveryMapLink: normalizedMapLink,
        parcelWeightKg,
        deliveryType: deliveryType ?? "STANDARD",
        productCost,
        deliveryFee,
        codFee,
        merchantEarnings,
        status: "PENDING",
        deliveryAttempts: 0,
        merchantNote: merchantNote?.trim() || null,
      })
      .returning({
        id: order.id,
        merchantId: order.merchantId,
        pickupLocationId: order.pickupLocationId,
        warehouseId: order.warehouseId,
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        deliveryAddress: order.deliveryAddress,
        deliveryMapLink: order.deliveryMapLink,
        parcelWeightKg: order.parcelWeightKg,
        deliveryType: order.deliveryType,
        productCost: order.productCost,
        deliveryFee: order.deliveryFee,
        codFee: order.codFee,
        merchantEarnings: order.merchantEarnings,
        status: order.status,
        merchantNote: order.merchantNote,
        createdAt: order.createdAt,
      })

    const platformFee = deliveryFee + codFee

    // Append an ORDER_CHARGE ledger entry for this order's platform fee.
    await tx.insert(balanceTransaction).values({
      merchantId,
      type: "ORDER_CHARGE",
      amount: platformFee,
      status: "SETTLED",
      note: inserted.id,
      orderId: inserted.id,
      createdBy: me.name,
    })

    // Upsert the merchant's running balance. onConflictDoUpdate handles the
    // first-order case where no balance row exists yet for this merchant.
    await tx
      .insert(merchantBalance)
      .values({ merchantId, balance: platformFee })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${platformFee}`,
          updatedAt: new Date().toISOString(),
        },
      })

    return [inserted]
  })

  return NextResponse.json(newOrder, { status: 201 })
}
