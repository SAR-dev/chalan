import { eq, inArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import {
  balanceTransaction,
  deliveryCity,
  merchant,
  merchantBalance,
  order,
  pickupLocation,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import { canPlaceOrders } from "@/lib/merchant-verification"
import {
  calcCodFee,
  calcDeliveryCharge,
  calcMerchantEarnings,
} from "@/lib/pricing"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { orderBulkCreateSchema, parseBody } from "@/lib/validation"

export async function POST(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can create orders")
  }

  const limited = rateLimit(`orders-bulk:${getClientIp(req)}`, 10, 60)
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
      baseRate: merchant.baseRate,
      extraRatePerKg: merchant.extraRatePerKg,
      freeWeightKg: merchant.freeWeightKg,
      maxWeightKg: merchant.maxWeightKg,
      codFeePercentage: merchant.codFeePercentage,
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
  const verification = canPlaceOrders(merchantRow as any)
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
  const pickups = await db
    .select({ id: pickupLocation.id, warehouseId: deliveryCity.warehouseId })
    .from(pickupLocation)
    .innerJoin(deliveryCity, eq(pickupLocation.cityId, deliveryCity.id))
    .where(inArray(pickupLocation.id, pickupLocationIds))
  const warehouseByPickup: Record<string, string> = {}
  for (const p of pickups) {
    if (!p.warehouseId) {
      return badRequest(`Pickup location ${p.id} has no warehouse assigned.`)
    }
    warehouseByPickup[p.id] = p.warehouseId
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

  // Fetch all relevant zone pricing
  const allZoneIds = [
    ...new Set([
      ...Object.values(origZoneByName),
      ...Object.values(destZoneMap),
    ]),
  ]
  const allZonePricing = allZoneIds.length
    ? await dbRead.select().from(zonePricing)
    : []

  const created = await db.transaction(async (tx) => {
    const values = inputs.map((input) => {
      // Resolve pricing: zone-to-zone → fallback to merchant
      type PricingInput = {
        baseRate: number
        extraRatePerKg: number
        freeWeightKg: number
        maxWeightKg: number
        codFeePercentage?: number | null
      }
      let pricing: PricingInput = merchantRow
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
        if (zonePrice) pricing = zonePrice
      }

      const { total: deliveryFee } = calcDeliveryCharge(
        pricing,
        input.parcelWeightKg,
      )
      const codFee = calcCodFee(
        input.productCost,
        pricing.codFeePercentage ?? merchantRow.codFeePercentage ?? 1,
      )
      const merchantEarnings = calcMerchantEarnings(
        input.productCost,
        deliveryFee,
        codFee,
      )
      const mapLink = input.deliveryMapLink?.trim()
      return {
        merchantId,
        pickupLocationId: input.pickupLocationId,
        warehouseId: warehouseByPickup[input.pickupLocationId],
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        deliveryCity: input.deliveryCity,
        deliveryCityId: input.deliveryCityId ?? null,
        deliveryAddress: input.deliveryAddress,
        deliveryMapLink: mapLink ? mapLink : null,
        parcelWeightKg: input.parcelWeightKg,
        deliveryType: input.deliveryType ?? "STANDARD",
        productCost: input.productCost,
        deliveryFee,
        codFee,
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
      deliveryCity: order.deliveryCity,
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

    // Compute total platform fee across the batch and write one ledger entry
    // per order, then upsert the running balance once for the whole batch.
    const totalPlatformFee = values.reduce(
      (sum, v) => sum + v.deliveryFee + v.codFee,
      0,
    )

    await tx.insert(balanceTransaction).values(
      insertedOrders.map((o) => ({
        merchantId,
        type: "ORDER_CHARGE" as const,
        amount: o.deliveryFee + o.codFee,
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
}
