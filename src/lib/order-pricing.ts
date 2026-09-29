import { and, eq } from "drizzle-orm"
import { dbRead } from "@/lib/db"
import {
  deliveryCity,
  platformConfig,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"

export interface ResolvedPricing {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
  cancellationFee: number
}

const FALLBACK: ResolvedPricing = {
  baseRate: 0,
  extraRatePerKg: 0,
  freeWeightKg: 1,
  maxWeightKg: 3,
  codFeePercentage: 1,
  cancellationFee: 0,
}

/**
 * Resolves the pricing for a route: the zone-pair row (origin = the pickup
 * warehouse's city zone, destination = the delivery city's zone), falling back
 * to the platform defaults. Shared by order creation and pickup re-pricing.
 */
export async function resolveRoutePricing(
  originWarehouseId: string,
  deliveryCityId: string | null,
): Promise<ResolvedPricing> {
  const [config] = await dbRead
    .select({
      baseRate: platformConfig.defaultBaseRate,
      extraRatePerKg: platformConfig.defaultExtraRatePerKg,
      freeWeightKg: platformConfig.defaultFreeWeightKg,
      maxWeightKg: platformConfig.defaultMaxWeightKg,
      codFeePercentage: platformConfig.defaultCodFeePercentage,
      cancellationFee: platformConfig.defaultCancellationFee,
    })
    .from(platformConfig)
    .limit(1)
  const fallback: ResolvedPricing = config ?? FALLBACK

  const [w] = await dbRead
    .select({ city: warehouse.city })
    .from(warehouse)
    .where(eq(warehouse.id, originWarehouseId))
    .limit(1)

  const [origCity] = w?.city
    ? await dbRead
        .select({ zoneId: deliveryCity.zoneId })
        .from(deliveryCity)
        .where(eq(deliveryCity.name, w.city))
        .limit(1)
    : []

  const [destCity] = deliveryCityId
    ? await dbRead
        .select({ zoneId: deliveryCity.zoneId })
        .from(deliveryCity)
        .where(eq(deliveryCity.id, deliveryCityId))
        .limit(1)
    : []

  if (origCity?.zoneId && destCity?.zoneId) {
    const [zp] = await dbRead
      .select()
      .from(zonePricing)
      .where(
        and(
          eq(zonePricing.fromZoneId, origCity.zoneId),
          eq(zonePricing.toZoneId, destCity.zoneId),
        ),
      )
      .limit(1)
    if (zp) return zp
  }
  return fallback
}
