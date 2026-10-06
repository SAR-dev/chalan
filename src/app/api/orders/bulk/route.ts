import { eq, inArray, sql } from "drizzle-orm"
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
import { pickupLocationHubs } from "@/lib/db/order-lookup"
import {
  balanceTransaction,
  deliveryCity,
  deliveryZone,
  merchant,
  merchantBalance,
  merchantPackage,
  order,
  warehouse,
  zoneDeliveryTime,
  zonePricing,
} from "@/lib/db/schema"
import { canPlaceOrders } from "@/lib/merchant-verification"
import { hasNavPermission } from "@/lib/nav-config"
import { computeExpectedDeliveryAt } from "@/lib/order-delivery-time"
import { lockAndResolveMerchantPackageRule } from "@/lib/order-pricing"
import { applyPackageRule, pickTierForCount } from "@/lib/packages"
import {
  calcCodFee,
  calcDeliveryCharge,
  calcMerchantEarnings,
} from "@/lib/pricing"
import { rateLimitByIp } from "@/lib/rate-limit"
import { generateTrackingToken } from "@/lib/tracking-token"
import { orderBulkCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can create orders")
  }
  // Bulk creation is the same New Order surface — moderators need the grant.
  if (!hasNavPermission(me, "/merchant/orders/new")) {
    return forbidden("You don't have access to create orders.")
  }

  const limited = await rateLimitByIp(req, "orders-bulk", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, orderBulkCreateSchema)
  if (parsed.error) return parsed.error
  const { orders: inputs } = parsed.data

  const [merchantRow] = await db
    .select({
      id: merchant.id,
      status: merchant.status,
      emailVerifiedAt: merchant.emailVerifiedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
    })
    .from(merchant)
    .where(eq(merchant.id, me.merchantId))
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

  // No merchant-wide weight cap: each row is checked against its own lane's
  // `zone_pricing.maxWeightKg` below, so a parcel can be heavier on one lane
  // than another and no batch-wide limit needs deciding.

  const merchantId = me.merchantId

  // Resolve warehouse + owner for each unique pickup location via city →
  // warehouse. Every location must belong to the caller — never book against
  // another merchant's shop address.
  const pickupLocationIds = [...new Set(inputs.map((i) => i.pickupLocationId))]
  const hubs = await pickupLocationHubs(pickupLocationIds)
  const warehouseByPickup: Record<string, string> = {}
  for (const p of pickupLocationIds) {
    const hub = hubs.get(p)
    if (!hub || hub.merchantId !== merchantId) {
      return notFound("Pickup location not found")
    }
    if (!hub.warehouseId) {
      return badRequest(`Pickup location ${p} has no warehouse assigned.`)
    }
    warehouseByPickup[p] = hub.warehouseId
  }

  // ── Pre-fetch zone pricing for all unique city pairs ──
  const warehouseIds = [...new Set(Object.values(warehouseByPickup))]
  const deliveryCityIds = [
    ...new Set(inputs.map((i) => i.deliveryCityId).filter(Boolean)),
  ]

  const warehouses = await dbRead
    .select({ id: warehouse.id, city: warehouse.city })
    .from(warehouse)
    .where(inArray(warehouse.id, warehouseIds))

  const warehouseCityMap: Record<string, string> = {}
  for (const w of warehouses) {
    warehouseCityMap[w.id] = w.city
  }

  const destCities = deliveryCityIds.length
    ? await dbRead
        .select({
          id: deliveryCity.id,
          zoneId: deliveryCity.zoneId,
          zoneName: deliveryZone.name,
        })
        .from(deliveryCity)
        .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
        .where(inArray(deliveryCity.id, deliveryCityIds))
    : []
  const destZoneMap: Record<string, string> = {}
  /** Zone id → name, so an error can name the pair that needs a rate. */
  const zoneNameById: Record<string, string> = {}
  for (const c of destCities) {
    destZoneMap[c.id] = c.zoneId
    if (c.zoneId && c.zoneName) zoneNameById[c.zoneId] = c.zoneName
  }

  // Get origin zones from warehouse cities
  const origCityNames = [
    ...new Set(Object.values(warehouseCityMap).filter(Boolean)),
  ]
  const origCities = origCityNames.length
    ? await dbRead
        .select({
          name: deliveryCity.name,
          zoneId: deliveryCity.zoneId,
          zoneName: deliveryZone.name,
        })
        .from(deliveryCity)
        .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
        .where(inArray(deliveryCity.name, origCityNames))
    : []
  const origZoneByName: Record<string, string> = {}
  for (const c of origCities) {
    origZoneByName[c.name] = c.zoneId
    if (c.zoneId && c.zoneName) zoneNameById[c.zoneId] = c.zoneName
  }

  // Fetch only the pricing rows whose origin zone is relevant:
  // `allZoneIds` is the union of the origin and destination zones, and the
  // lookup below always matches `fromZoneId` against an origin zone.
  const allZoneIds = [
    ...new Set([
      ...Object.values(origZoneByName),
      ...Object.values(destZoneMap),
    ]),
  ]
  const allZonePricing = allZoneIds.length
    ? await dbRead
        .select()
        .from(zonePricing)
        .where(inArray(zonePricing.fromZoneId, allZoneIds))
    : []

  // The delivery-time matrix, prefetched the same way and over the same zone
  // set. Never a blocker: an unpriced lane rejects the batch, an un-timed lane
  // simply gets no estimate (`expectedDeliveryAt` null).
  const allZoneDeliveryTime = allZoneIds.length
    ? await dbRead
        .select()
        .from(zoneDeliveryTime)
        .where(inArray(zoneDeliveryTime.fromZoneId, allZoneIds))
    : []

  type PricingInput = {
    baseRate: number
    extraRatePerKg: number
    freeWeightKg: number
    maxWeightKg: number
    codFeePercentage: number
    cancellationFee: number
  }

  /**
   * The zone ids behind one input row — origin from the pickup warehouse's city,
   * destination from the delivery city.
   *
   * This derivation used to be written out inside both `pricingFor` and
   * `laneOf`, which is two places that could disagree about what a lane is; the
   * delivery-time lookup would have made three. One function, three callers.
   */
  const zonePairOf = (input: (typeof inputs)[number]) => {
    const origWarehouseCity =
      warehouseCityMap[warehouseByPickup[input.pickupLocationId]]
    return {
      fromZoneId: origWarehouseCity
        ? origZoneByName[origWarehouseCity]
        : undefined,
      toZoneId: input.deliveryCityId
        ? destZoneMap[input.deliveryCityId]
        : undefined,
    }
  }

  /**
   * Zone pricing is the single source of these rates — there is no platform
   * fallback, so a row whose lane has no `zone_pricing` row cannot be priced and
   * is reported per-row rather than silently inheriting a default. Mirrors
   * `resolveRoutePricing` (same matrix, same "configured" definition); this
   * path batches the lookup instead of calling per row.
   */
  const pricingFor = (input: (typeof inputs)[number]): PricingInput | null => {
    const { fromZoneId, toZoneId } = zonePairOf(input)
    if (!fromZoneId || !toZoneId) return null
    return (
      allZonePricing.find(
        (z) => z.fromZoneId === fromZoneId && z.toZoneId === toZoneId,
      ) ?? null
    )
  }

  /**
   * The quoted delivery days for a row, or null when the lane has no
   * `zone_delivery_time` row. Null is not an error — it means "no promise",
   * which the single-create path expresses the same way.
   */
  const deliveryDaysFor = (input: (typeof inputs)[number]): number | null => {
    const { fromZoneId, toZoneId } = zonePairOf(input)
    if (!fromZoneId || !toZoneId) return null
    return (
      allZoneDeliveryTime.find(
        (t) => t.fromZoneId === fromZoneId && t.toZoneId === toZoneId,
      )?.deliveryDays ?? null
    )
  }

  const laneOf = (input: (typeof inputs)[number]) => {
    const { fromZoneId, toZoneId } = zonePairOf(input)
    return {
      fromZone: fromZoneId ? (zoneNameById[fromZoneId] ?? null) : null,
      toZone: toZoneId ? (zoneNameById[toZoneId] ?? null) : null,
    }
  }

  // Unpriced lanes are rejected before anything is written, so a batch can
  // never half-create against a fallback.
  const unpriced = inputs
    .map((o, i) => ({ i, lane: laneOf(o) }))
    .filter((_, i) => pricingFor(inputs[i]) === null)
  if (unpriced.length > 0) {
    const first = unpriced[0].lane
    return NextResponse.json(
      {
        error:
          first.fromZone && first.toZone
            ? `${unpriced.length} parcel(s) have no delivery pricing configured for ${first.fromZone} → ${first.toZone}.`
            : `${unpriced.length} parcel(s) cannot be priced: the pickup or delivery city is not assigned to a delivery zone.`,
        rows: unpriced.map((o) => o.i),
      },
      { status: 400 },
    )
  }

  // The rate is undefined above its own max weight — reject those rows too.
  const overRouteLimit = inputs
    .map((o, i) => ({ i, weight: o.parcelWeightKg, pricing: pricingFor(o) }))
    .filter((o) => o.pricing && o.weight > o.pricing.maxWeightKg)
  if (overRouteLimit.length > 0) {
    return NextResponse.json(
      {
        error: `${overRouteLimit.length} parcel(s) exceed the route weight limit.`,
        rows: overRouteLimit.map((o) => o.i),
      },
      { status: 400 },
    )
  }

  // One clock for the creation instant and for every promise derived from it —
  // see the same comment on the single-create path.
  const createdAtIso = new Date().toISOString()

  const created = await db.transaction(async (tx) => {
    // Lock the merchant's active bundle once. Each order resolves its own tier
    // against the cumulative count, so a batch that crosses a tier boundary is
    // priced correctly order-by-order.
    const bundle = await lockAndResolveMerchantPackageRule(tx, merchantId)

    const values = inputs.map((input, index) => {
      // Non-null: every row was proved to have a lane price by the `unpriced`
      // guard above, which returns before this transaction starts.
      const pricing = pricingFor(input) as PricingInput

      // Money is stored to paisa — never carry sub-paisa noise.
      const productCost = toPaisa(input.productCost)
      const { total: zoneDeliveryFee } = calcDeliveryCharge(
        pricing,
        input.parcelWeightKg,
      )
      const tier = bundle
        ? pickTierForCount(bundle.tiers, bundle.ordersUsed + index)
        : null
      const deliveryFee = applyPackageRule(zoneDeliveryFee, tier)
      const codFee = calcCodFee(productCost, pricing.codFeePercentage ?? 1)
      const merchantEarnings = calcMerchantEarnings(
        productCost,
        deliveryFee,
        codFee,
      )
      const mapLink = input.deliveryMapLink?.trim()
      return {
        merchantId,
        pickupLocationId: input.pickupLocationId,
        warehouseId: warehouseByPickup[input.pickupLocationId],
        trackingToken: generateTrackingToken(),
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        // Already trimmed and null-on-blank by `orderCreateSchema`, exactly
        // like `itemType` below — a CSV with no recipient_mail column lands
        // here as null rather than as "".
        recipientMail: input.recipientMail ?? null,
        deliveryCityId: input.deliveryCityId ?? null,
        deliveryAddress: input.deliveryAddress,
        deliveryMapLink: mapLink ? mapLink : null,
        parcelWeightKg: input.parcelWeightKg,
        // Carried straight from the validated input. `orderCreateSchema` has
        // already trimmed it and turned blank into null, so a missing item_type
        // column in the CSV lands here as null rather than an empty string that
        // would later read back as "the merchant typed nothing".
        itemType: input.itemType ?? null,
        deliveryType: input.deliveryType ?? "STANDARD",
        productCost,
        deliveryFee,
        codFee,
        cancellationFee: toPaisa(pricing.cancellationFee ?? 0),
        merchantEarnings,
        packageId: bundle?.packageId ?? null,
        packageTierId: tier?.id ?? null,
        merchantPackageId: bundle?.merchantPackageId ?? null,
        packageRuleType: tier?.ruleType ?? null,
        packageRuleValue: tier?.ruleValue ?? null,
        status: "PENDING" as const,
        deliveryAttempts: 0,
        merchantNote: input.merchantNote?.trim() || null,
        // The quoted delivery promise, snapshotted per row.
        createdAt: createdAtIso,
        expectedDeliveryDays: deliveryDaysFor(input),
        expectedDeliveryAt: computeExpectedDeliveryAt(
          createdAtIso,
          deliveryDaysFor(input),
        ),
      }
    })

    const insertedOrders = await tx.insert(order).values(values).returning({
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

    // Compute total platform fee across the batch and write one ledger entry
    // per order, then upsert the running balance once for the whole batch.
    const totalPlatformFee = values.reduce(
      (sum, v) => sum + orderChargeAmount(v.deliveryFee, v.codFee),
      0,
    )

    await tx.insert(balanceTransaction).values(
      insertedOrders.map((o) => ({
        merchantId,
        type: "ORDER_CHARGE" as const,
        amount: orderChargeAmount(o.deliveryFee, o.codFee),
        status: "SETTLED" as const,
        note: o.id,
        orderId: o.id,
        createdBy: me.name,
      })),
    )

    await tx
      .insert(merchantBalance)
      .values({ merchantId, balance: totalPlatformFee })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${totalPlatformFee}`,
          updatedAt: new Date().toISOString(),
        },
      })

    // Consume the batch's orders from the bundle quota.
    if (bundle && insertedOrders.length > 0) {
      await tx
        .update(merchantPackage)
        .set({
          ordersUsed: sql`${merchantPackage.ordersUsed} + ${insertedOrders.length}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(merchantPackage.id, bundle.merchantPackageId))
    }

    return insertedOrders
  })

  return NextResponse.json(created, { status: 201 })
})
