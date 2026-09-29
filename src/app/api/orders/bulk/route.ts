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
import { pickupWarehouseIds } from "@/lib/db/order-lookup"
import {
  balanceTransaction,
  deliveryCity,
  merchant,
  merchantBalance,
  order,
  platformConfig,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import { canPlaceOrders } from "@/lib/merchant-verification"
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
      maxWeightKg: merchant.maxWeightKg,
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

  const overweight = inputs
    .map((o, i) => ({ i, weight: o.parcelWeightKg }))
    .filter((o) => o.weight > merchantRow.maxWeightKg)
  if (overweight.length > 0) {
    // Custom shape with `rows` array — needs raw NextResponse.json.
    return NextResponse.json(
      {
        error: `${overweight.length} parcel(s) exceed the ${merchantRow.maxWeightKg} KG limit.`,
        rows: overweight.map((o) => o.i),
      },
      { status: 400 },
    )
  }

  const merchantId = me.merchantId

  // Resolve warehouse for each unique pickup location via city → warehouse.
  const pickupLocationIds = [...new Set(inputs.map((i) => i.pickupLocationId))]
  const pickupWarehouses = await pickupWarehouseIds(pickupLocationIds)
  const warehouseByPickup: Record<string, string> = {}
  for (const p of pickupLocationIds) {
    const warehouseId = pickupWarehouses.get(p) ?? null
    if (!warehouseId) {
      return badRequest(`Pickup location ${p} has no warehouse assigned.`)
    }
    warehouseByPickup[p] = warehouseId
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
        .select({ id: deliveryCity.id, zoneId: deliveryCity.zoneId })
        .from(deliveryCity)
        .where(inArray(deliveryCity.id, deliveryCityIds))
    : []
  const destZoneMap: Record<string, string> = {}
  for (const c of destCities) {
    destZoneMap[c.id] = c.zoneId
  }

  // Get origin zones from warehouse cities
  const origCityNames = [
    ...new Set(Object.values(warehouseCityMap).filter(Boolean)),
  ]
  const origCities = origCityNames.length
    ? await dbRead
        .select({ name: deliveryCity.name, zoneId: deliveryCity.zoneId })
        .from(deliveryCity)
        .where(inArray(deliveryCity.name, origCityNames))
    : []
  const origZoneByName: Record<string, string> = {}
  for (const c of origCities) {
    origZoneByName[c.name] = c.zoneId
  }

  // Fetch only the pricing rows whose origin zone is relevant (ROADMAP P3):
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

  // Platform defaults are the fallback when a city pair has no zone row.
  const [config] = await dbRead
    .select({
      defaultBaseRate: platformConfig.defaultBaseRate,
      defaultExtraRatePerKg: platformConfig.defaultExtraRatePerKg,
      defaultFreeWeightKg: platformConfig.defaultFreeWeightKg,
      defaultMaxWeightKg: platformConfig.defaultMaxWeightKg,
      defaultCodFeePercentage: platformConfig.defaultCodFeePercentage,
      defaultCancellationFee: platformConfig.defaultCancellationFee,
    })
    .from(platformConfig)
    .limit(1)

  type PricingInput = {
    baseRate: number
    extraRatePerKg: number
    freeWeightKg: number
    maxWeightKg: number
    codFeePercentage: number
    cancellationFee: number
  }
  const platformPricing: PricingInput = {
    baseRate: config?.defaultBaseRate ?? 0,
    extraRatePerKg: config?.defaultExtraRatePerKg ?? 0,
    freeWeightKg: config?.defaultFreeWeightKg ?? 1,
    maxWeightKg: config?.defaultMaxWeightKg ?? 3,
    codFeePercentage: config?.defaultCodFeePercentage ?? 1,
    cancellationFee: config?.defaultCancellationFee ?? 0,
  }
  const pricingFor = (input: (typeof inputs)[number]): PricingInput => {
    const origWarehouseCity =
      warehouseCityMap[warehouseByPickup[input.pickupLocationId]]
    const destZoneId = input.deliveryCityId
      ? destZoneMap[input.deliveryCityId]
      : undefined
    const origZoneId = origWarehouseCity
      ? origZoneByName[origWarehouseCity]
      : undefined
    if (origZoneId && destZoneId) {
      const zonePrice = allZonePricing.find(
        (z) => z.fromZoneId === origZoneId && z.toZoneId === destZoneId,
      )
      if (zonePrice) return zonePrice
    }
    return platformPricing
  }

  // The rate is undefined above its own max weight — reject those rows too.
  const overRouteLimit = inputs
    .map((o, i) => ({ i, weight: o.parcelWeightKg, pricing: pricingFor(o) }))
    .filter((o) => o.weight > o.pricing.maxWeightKg)
  if (overRouteLimit.length > 0) {
    return NextResponse.json(
      {
        error: `${overRouteLimit.length} parcel(s) exceed the route weight limit.`,
        rows: overRouteLimit.map((o) => o.i),
      },
      { status: 400 },
    )
  }

  const created = await db.transaction(async (tx) => {
    const values = inputs.map((input) => {
      const pricing = pricingFor(input)

      // Money is stored to paisa (ROADMAP P0.4) — never carry sub-paisa noise.
      const productCost = toPaisa(input.productCost)
      const { total: deliveryFee } = calcDeliveryCharge(
        pricing,
        input.parcelWeightKg,
      )
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
        deliveryCityId: input.deliveryCityId ?? null,
        deliveryAddress: input.deliveryAddress,
        deliveryMapLink: mapLink ? mapLink : null,
        parcelWeightKg: input.parcelWeightKg,
        deliveryType: input.deliveryType ?? "STANDARD",
        productCost,
        deliveryFee,
        codFee,
        cancellationFee: toPaisa(pricing.cancellationFee ?? 0),
        merchantEarnings,
        status: "PENDING" as const,
        deliveryAttempts: 0,
        merchantNote: input.merchantNote?.trim() || null,
      }
    })

    const insertedOrders = await tx.insert(order).values(values).returning({
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

    return insertedOrders
  })

  return NextResponse.json(created, { status: 201 })
})
