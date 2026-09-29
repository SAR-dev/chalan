/**
 * Per-parcel charge quote shared by the order-create page and the bulk-import
 * preview. Zone-pair pricing wins; the platform defaults are the fallback —
 * there are no per-merchant rates anymore. The effective weight cap is the
 * tighter of the merchant's admin-set limit and the rate's own max weight.
 * Pure module: lookups are injected.
 */

import type { PlatformPricingDefaults } from "@/features/platform-config/hooks/use-platform-pricing-public"
import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import {
  calcCodFee,
  calcDeliveryCharge,
  type DeliveryChargeBreakdown,
} from "@/lib/pricing"
import type { DeliveryCity, PickupLocation } from "@/lib/types"

export interface ParcelQuoteArgs {
  pickupLocationId: string
  deliveryCityId: string
  parcelWeightKg: string
  productCost: string
  pickupLocations: Array<Pick<PickupLocation, "id" | "cityId">>
  deliveryCities: Array<Pick<DeliveryCity, "id" | "name" | "zoneId">>
  zonePricing: ZonePricingEstimate[]
  platformDefaults: PlatformPricingDefaults | null
  /** The merchant's max parcel weight (admin-set). */
  maxWeightKg: number
}

export interface ParcelQuote {
  weight: number
  productCost: number
  breakdown: DeliveryChargeBreakdown | null
  deliveryCharge: number
  codFee: number
  cancellationFee: number
  /** Effective cap: min(merchant limit, rate max weight). */
  maxWeightKg: number
  exceedsMax: boolean
  isZonePricing: boolean
}

export function quoteParcel(args: ParcelQuoteArgs): ParcelQuote {
  const weight = Number(args.parcelWeightKg) || 0
  const productCost = Number(args.productCost) || 0

  // Origin zone comes from THIS parcel's pickup location.
  const pickupLoc = args.pickupLocations.find(
    (l) => l.id === args.pickupLocationId,
  )
  const originCity = args.deliveryCities.find((c) => c.id === pickupLoc?.cityId)
  const originZoneId = originCity?.zoneId ?? null

  const destCity = args.deliveryCities.find((c) => c.id === args.deliveryCityId)
  const destZoneId = destCity?.zoneId ?? null
  const zonePrice =
    originZoneId && destZoneId
      ? args.zonePricing.find(
          (z) => z.fromZoneId === originZoneId && z.toZoneId === destZoneId,
        )
      : null

  // Zone pricing wins; platform defaults are the fallback.
  const pricing = zonePrice ?? args.platformDefaults
  const breakdown = pricing ? calcDeliveryCharge(pricing, weight) : null
  const codFee = pricing
    ? calcCodFee(productCost, pricing.codFeePercentage ?? 1)
    : 0
  const cancellationFee = pricing?.cancellationFee ?? 0
  const maxWeightKg = Math.min(
    args.maxWeightKg,
    pricing?.maxWeightKg ?? args.maxWeightKg,
  )

  return {
    weight,
    productCost,
    breakdown,
    deliveryCharge: breakdown?.total ?? 0,
    codFee,
    cancellationFee,
    maxWeightKg,
    exceedsMax: weight > maxWeightKg,
    isZonePricing: !!zonePrice,
  }
}
