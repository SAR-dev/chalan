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
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { db, dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { pickupLocationHubs } from "@/lib/db/order-lookup"
import { buildWarehouseOrderScope } from "@/lib/db/order-scope"
import {
  balanceTransaction,
  deliveryCity as deliveryCityTable,
  merchant,
  merchantBalance,
  merchantPackage,
  order,
  orderStatuses,
  pickupLocation,
  warehouse,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import { canPlaceOrders } from "@/lib/merchant-verification"
import { hasNavPermission } from "@/lib/nav-config"
import {
  computeExpectedDeliveryAt,
  resolveRouteDeliveryTime,
} from "@/lib/order-delivery-time"
import {
  lockAndResolveMerchantPackageRule,
  resolveRoutePricing,
} from "@/lib/order-pricing"
import { applyPackageRule } from "@/lib/packages"
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
  pricingUnavailableMessage,
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
    case "RIDER": {
      if (!me.riderId) return NextResponse.json(paginateResponse([], 0))
      // A rider has two queues, and this endpoint returned their union. Each
      // queue page then filtered client-side while still reporting the union's
      // `total`, so "Showing 1-20 of 137" sat above four visible rows and
      // page 2 showed a different subset — a rider could believe a queue was
      // Cleared when it was not. Filtering here makes the rows
      // and the count the same query.
      //
      // An unrecognised value falls back to the union rather than matching
      // nothing, mirroring parseStatusFilter's handling of unknown statuses.
      const queue = new URL(req.url).searchParams.get("queue")
      where =
        queue === "pickup"
          ? eq(order.pickupRiderId, me.riderId)
          : queue === "delivery"
            ? eq(order.deliveryRiderId, me.riderId)
            : or(
                eq(order.pickupRiderId, me.riderId),
                eq(order.deliveryRiderId, me.riderId),
              )
      break
    }
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
    // Per-table EXISTS instead of one OR spanning every joined table.
    // A trigram GIN index can serve a same-table bitmap-OR, but not ORs
    // that cross relations — with all six `ilike`s inlined after four LEFT
    // JOINs the planner's only real choice was "join everything, then filter".
    // Each EXISTS is now self-contained: one index scan per table, short-
    // circuited as soon as a hit is found, and the joins are no longer needed
    // to *filter* at all (only to project `merchantPhone`).
    const searchClause = or(
      ilike(order.id, likeQ),
      ilike(order.recipientName, likeQ),
      ilike(order.recipientPhone, likeQ),
      // `sql` not drizzle's `exists()`: these are correlated on `order`, and
      // only a hand-built `EXISTS (…)` expresses that — the helper wants a
      // plain subquery and would emit a non-correlated `in`-style scan.
      sql`exists (select 1 from ${merchant} where ${merchant.id} = ${order.merchantId} and ${merchant.businessName} ilike ${likeQ})`,
      sql`exists (select 1 from ${warehouse} where ${warehouse.id} = ${order.warehouseId} and (${warehouse.name} ilike ${likeQ} or ${warehouse.city} ilike ${likeQ}))`,
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

  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })

  // Lean projection for list view — omits wide/rarely-rendered columns such as
  // pickupProofRefs and the ~15 lifecycle timestamps.
  const listColumns = {
    ...ORDER_CORE_COLUMNS,
    merchantNote: order.merchantNote,
    merchantPhone: merchant.phone,
    pickupLocationMapLink: pickupLocation.mapLink,
    // The promise, so the merchant's list can show it without a second read.
    expectedDeliveryAt: order.expectedDeliveryAt,
  }

  // The merchant join is for the projection (`merchantPhone`); the search no
  // Longer needs it — see the EXISTS clauses above. The
  // warehouse join went away entirely with them.
  let dbQuery = dbRead
    .select(listColumns)
    .from(order)
    .leftJoin(merchant, eq(order.merchantId, merchant.id))
    .leftJoin(pickupLocation, eq(order.pickupLocationId, pickupLocation.id))
    .leftJoin(deliveryCityTable, eq(order.deliveryCityId, deliveryCityTable.id))
    .$dynamic()
  if (where) dbQuery = dbQuery.where(where)

  // COUNT walks `order` alone: every search term now resolves inside its own
  // EXISTS subquery, so no join is reachable from `where`.
  const countQuery = dbRead
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
  } else {
    // Stable default: without a deterministic order, OFFSET paging can repeat
    // or skip rows when the underlying set changes between pages.
    dbQuery = dbQuery.orderBy(desc(order.createdAt), desc(order.id))
  }

  if (limit !== undefined) dbQuery = dbQuery.limit(limit)
  if (offset !== undefined) dbQuery = dbQuery.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([countQuery, dbQuery])

  // `trackingToken` is the write capability for the public receiver-note
  // endpoint. Only the order's own merchant (and a SUPER_ADMIN) has any business
  // with it: a warehouse admin's scope spans other merchants' orders, and riders
  // never need it. Their UIs fall back to the order id for the /track link,
  // which the public page resolves too.
  const payload =
    me.role === "MERCHANT" || me.role === "SUPER_ADMIN"
      ? rows
      : rows.map(({ trackingToken: _trackingToken, ...rest }) => rest)

  return NextResponse.json(paginateResponse(payload, count, limit, offset))
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can create orders")
  }
  // Order creation is the New Order surface — a moderator needs the grant
  if (!hasNavPermission(me, "/merchant/orders/new")) {
    return forbidden("You don't have access to create orders.")
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
    recipientMail,
    deliveryAddress,
    deliveryMapLink,
    parcelWeightKg,
    itemType,
    deliveryType,
    productCost: rawProductCost,
    merchantNote,
  } = parsed.data

  // Money is stored to paisa — never carry sub-paisa noise.
  const productCost = toPaisa(rawProductCost)

  const normalizedMapLink = deliveryMapLink?.trim()
    ? deliveryMapLink.trim()
    : null

  // Idempotency: a retried create with the same key returns the
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

  // One query resolves both the serving warehouse and the owner: the location
  // must belong to the caller, so a merchant can never book against another
  // merchant's shop address.
  const pickupHub = (await pickupLocationHubs([pickupLocationId])).get(
    pickupLocationId,
  )
  if (!pickupHub || pickupHub.merchantId !== merchantId) {
    return notFound("Pickup location not found")
  }
  const hubId = pickupHub.warehouseId
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

  // ── Pricing: zone pricing is the single source for delivery, COD and
  //    cancellation fees. There is no platform fallback — an unconfigured lane
  //    is a configuration gap and is rejected with the reason, so the admin can
  //    fix the right thing. Shared with pickup re-pricing so the two cannot
  //    drift on what counts as a configured lane.
  const destCityId = parsed.data.deliveryCityId
  const resolved = await resolveRoutePricing(hub.id, destCityId ?? null)
  if (!resolved.ok) {
    return badRequest(
      pricingUnavailableMessage(
        resolved.reason,
        resolved.fromZone,
        resolved.toZone,
      ),
    )
  }
  const pricing = resolved.pricing

  // ── Delivery time: the same zone-pair matrix as pricing, but never blocking.
  //    An unconfigured lane yields no estimate and the order still proceeds —
  //    pricing rejects because money would be owed on a lane nobody configured,
  //    while a missing promised date is a gap in what we can *show*.
  const deliveryTime = await resolveRouteDeliveryTime(
    hub.id,
    destCityId ?? null,
  )
  const expectedDeliveryDays = deliveryTime.ok ? deliveryTime.days : null

  const { total: zoneDeliveryFee, exceedsMax } = calcDeliveryCharge(
    pricing,
    parcelWeightKg,
  )
  // The rate is undefined above its own max weight — that is the ONLY weight
  // limit: a parcel may be heavier on one lane than another, and there is no
  // per-merchant cap to disagree with it.
  if (exceedsMax) {
    return badRequest(
      `Parcel weight exceeds the ${pricing.maxWeightKg} KG limit for this route.`,
    )
  }
  const codFee = calcCodFee(productCost, pricing.codFeePercentage ?? 1)
  const cancellationFee = toPaisa(pricing.cancellationFee ?? 0)

  // One clock for the creation instant and for the promise derived from it.
  // The promise is end-of-day N days after *this* instant, so computing it from
  // the app clock while `createdAt` defaults to the database's could disagree by
  // a whole day if an order landed within a few ms of midnight Dhaka.
  const createdAtIso = new Date().toISOString()

  const created = await db.transaction(async (tx) => {
    // Lock the merchant's active bundle (if any) and resolve the tier unlocked
    // at the current order count. The zone fee is discounted by the rule and
    // the rule is snapshotted onto the order below.
    const bundle = await lockAndResolveMerchantPackageRule(tx, merchantId)
    const deliveryFee = applyPackageRule(zoneDeliveryFee, bundle?.rule)
    const merchantEarnings = calcMerchantEarnings(
      productCost,
      deliveryFee,
      codFee,
    )

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
        recipientMail,
        deliveryCityId: destCityId ?? null,
        deliveryAddress,
        deliveryMapLink: normalizedMapLink,
        parcelWeightKg,
        itemType,
        deliveryType: deliveryType ?? "STANDARD",
        productCost,
        deliveryFee,
        codFee,
        cancellationFee,
        merchantEarnings,
        packageId: bundle?.packageId ?? null,
        packageTierId: bundle?.tierId ?? null,
        merchantPackageId: bundle?.merchantPackageId ?? null,
        packageRuleType: bundle?.rule?.ruleType ?? null,
        packageRuleValue: bundle?.rule?.ruleValue ?? null,
        status: "PENDING",
        deliveryAttempts: 0,
        merchantNote: merchantNote?.trim() || null,
        // The quoted delivery promise, snapshotted — see `zone_delivery_time`.
        createdAt: createdAtIso,
        expectedDeliveryDays,
        expectedDeliveryAt: computeExpectedDeliveryAt(
          createdAtIso,
          expectedDeliveryDays,
        ),
      })
      .onConflictDoNothing()
      .returning({
        id: order.id,
        merchantId: order.merchantId,
        pickupLocationId: order.pickupLocationId,
        warehouseId: order.warehouseId,
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        recipientMail: order.recipientMail,
        deliveryAddress: order.deliveryAddress,
        deliveryMapLink: order.deliveryMapLink,
        parcelWeightKg: order.parcelWeightKg,
        itemType: order.itemType,
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

    // Consume one order from the bundle's quota (only on a real insert — a
    // replayed idempotent request must not double-count).
    if (bundle) {
      await tx
        .update(merchantPackage)
        .set({
          ordersUsed: sql`${merchantPackage.ordersUsed} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(merchantPackage.id, bundle.merchantPackageId))
    }

    return { replay: false as const, order: inserted }
  })

  if (created.replay) {
    const existing = idempotencyKey ? await findByKey() : undefined
    if (existing) return NextResponse.json(existing)
    return badRequest("Duplicate request")
  }

  return NextResponse.json(created.order, { status: 201 })
})
