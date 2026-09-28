import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { orderChargeAmount, toPaisa } from "@/lib/balance-ledger"
import { db, dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { pickupWarehouseId } from "@/lib/db/order-lookup"
import { buildWarehouseOrderScope } from "@/lib/db/order-scope"
import {
  balanceTransaction,
  deliveryCity as deliveryCityTable,
  merchant,
  merchantBalance,
  order,
  orderStatuses,
  pickupLocation,
  platformConfig,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import { canPlaceOrders } from "@/lib/merchant-verification"
import {
  paginateResponse,
  parseDateRange,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import {
  calcCodFee,
  calcDeliveryCharge,
  calcMerchantEarnings,
} from "@/lib/pricing"
import { rateLimitByIp } from "@/lib/rate-limit"
import { generateTrackingToken } from "@/lib/tracking-token"
import { orderCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
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
      // Shared scope: logged-in orders, intake candidates, APPROVED orders
      // awaiting pickup-rider assignment (see buildWarehouseOrderScope()).
      where = buildWarehouseOrderScope(me.warehouseId)
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

  const statuses = parseStatusFilter(req, orderStatuses)
  if (statuses.length > 0) {
    const statusClause = inArray(
      order.status,
      enumValues<(typeof orderStatuses)[number]>(statuses),
    )
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
    ...ORDER_CORE_COLUMNS,
    merchantNote: order.merchantNote,
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
        .select({ count: sql<number>`count(*)::int` })
        .from(order)
        .leftJoin(merchant, eq(order.merchantId, merchant.id))
        .leftJoin(warehouse, eq(order.warehouseId, warehouse.id))
        .where(where)
    : dbRead
        .select({ count: sql<number>`count(*)::int` })
        .from(order)
        .where(where)

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
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can create orders")
  }

  const merchantId = me.merchantId

  const limited = await rateLimitByIp(req, "orders", 30, 60)
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
    productCost: rawProductCost,
    merchantNote,
  } = parsed.data

  // Money is stored to paisa (ROADMAP P0.4) — never carry sub-paisa noise.
  const productCost = toPaisa(rawProductCost)

  const normalizedMapLink = deliveryMapLink?.trim()
    ? deliveryMapLink.trim()
    : null

  // Idempotency (ROADMAP B13): a retried create with the same key returns the
  // original order instead of charging twice. Checked before any pricing work;
  // the unique (merchantId, key) index makes the concurrent case safe too.
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null
  const findByKey = () =>
    dbRead
      .select()
      .from(order)
      .where(
        and(
          eq(order.merchantId, merchantId),
          eq(order.idempotencyKey, idempotencyKey!),
        ),
      )
      .limit(1)
      .then((r) => r[0])
  if (idempotencyKey) {
    const existing = await findByKey()
    if (existing) return NextResponse.json(existing)
  }

  const hubId = await pickupWarehouseId(pickupLocationId)
  if (!hubId) {
    return badRequest("Pickup location has no warehouse assigned.")
  }
  const [hub] = await db
    .select({ id: warehouse.id, isActive: warehouse.isActive })
    .from(warehouse)
    .where(eq(warehouse.id, hubId))
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
      cancellationFee: merchant.cancellationFee,
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
  const verification = canPlaceOrders(merchantRow)
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
  // Cancellation fee is resolved alongside the delivery fee: the zone-pair row
  // wins, otherwise the platform default applies. Snapshotted on the order so a
  // later return is priced at creation time, not at return time.
  let cancellationFee: number | null = null
  if (origCity?.zoneId && destCity?.zoneId) {
    // At most one row per (fromZone, toZone) — `zone_pricing_pair_uniq`
    // (ROADMAP P1.1), so this pick is deterministic. The limit is kept as a
    // guard against a pair that somehow predates the index.
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
      cancellationFee = toPaisa(zonePrice.cancellationFee)
    }
  }
  // Cancellation fee resolves through the same chain as the delivery rate
  // (ROADMAP B6): zone-pair row wins, then the merchant's own fee, then the
  // platform default. A merchant fee of 0 means "inherit the platform default".
  if (cancellationFee === null) {
    cancellationFee = toPaisa(merchantRow.cancellationFee ?? 0)
  }
  if (cancellationFee === 0) {
    const [config] = await dbRead
      .select({ fee: platformConfig.defaultCancellationFee })
      .from(platformConfig)
      .limit(1)
    cancellationFee = toPaisa(config?.fee ?? 0)
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

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(order)
      .values({
        merchantId,
        pickupLocationId,
        warehouseId: hub.id,
        trackingToken: generateTrackingToken(),
        idempotencyKey,
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
        cancellationFee,
        merchantEarnings,
        status: "PENDING",
        deliveryAttempts: 0,
        merchantNote: merchantNote?.trim() || null,
      })
      .onConflictDoNothing()
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
        cancellationFee: order.cancellationFee,
        merchantEarnings: order.merchantEarnings,
        status: order.status,
        merchantNote: order.merchantNote,
        createdAt: order.createdAt,
      })

    // Lost the race to a concurrent retry — nothing to write; the caller
    // re-reads the winner below.
    if (!inserted) return { replay: true as const }

    const platformFee = orderChargeAmount(deliveryFee, codFee)

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

    return { replay: false as const, order: inserted }
  })

  if (created.replay) {
    const existing = idempotencyKey ? await findByKey() : undefined
    if (existing) return NextResponse.json(existing)
    return badRequest("Duplicate request")
  }

  return NextResponse.json(created.order, { status: 201 })
})
