/**
 * Per-parcel charge quote shared by the order-create page and the bulk-import
 * preview. Extracted verbatim from the `rows` memo in
 * `src/app/merchant/orders/new/page.tsx` so both surfaces quote identically:
 * origin zone comes from the parcel's pickup location → city → zone, zone
 * pricing wins over the merchant's flat rate, COD fee follows the zone's
 * (or the merchant's) percentage. Pure module: lookups are injected.
 */

import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import {
  calcCodFee,
  calcDeliveryCharge,
  type DeliveryChargeBreakdown,
} from "@/lib/pricing"
import type { DeliveryCity, Merchant, PickupLocation } from "@/lib/types"

/** The pricing fields a quote reads off the merchant (zone rows share them). */
export type MerchantQuote = Pick<
  Merchant,
  | "baseRate"
  | "extraRatePerKg"
  | "freeWeightKg"
  | "maxWeightKg"
  | "codFeePercentage"
>

export interface ParcelQuoteArgs {
  pickupLocationId: string
  deliveryCityId: string
  parcelWeightKg: string
  productCost: string
  pickupLocations: Array<Pick<PickupLocation, "id" | "cityId">>
  deliveryCities: Array<Pick<DeliveryCity, "id" | "name" | "zoneId">>
  zonePricing: ZonePricingEstimate[]
  currentMerchant: MerchantQuote | null | undefined
}

export interface ParcelQuote {
  weight: number
  productCost: number
  breakdown: DeliveryChargeBreakdown | null
  deliveryCharge: number
  codFee: number
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

  // Zone pricing: try to find pricing from origin zone to destination zone
  const destCity = args.deliveryCities.find((c) => c.id === args.deliveryCityId)
  const destZoneId = destCity?.zoneId ?? null
  const zonePrice =
    originZoneId && destZoneId
      ? args.zonePricing.find(
          (z) => z.fromZoneId === originZoneId && z.toZoneId === destZoneId,
        )
      : null

  // Use zone pricing if available, otherwise fall back to merchant pricing
  const pricing = zonePrice ?? args.currentMerchant
  const breakdown = pricing ? calcDeliveryCharge(pricing, weight) : null
  const exceedsMax = breakdown?.exceedsMax ?? false
  const codFeePercentage = zonePrice
    ? (zonePrice.codFeePercentage ??
      args.currentMerchant?.codFeePercentage ??
      1)
    : (args.currentMerchant?.codFeePercentage ?? 1)
  const codFee = args.currentMerchant
    ? calcCodFee(productCost, codFeePercentage)
    : 0

  return {
    weight,
    productCost,
    breakdown,
    deliveryCharge: breakdown?.total ?? 0,
    codFee,
    exceedsMax,
    isZonePricing: !!zonePrice,
  }
}
