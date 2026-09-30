/**
 * Per-parcel charge quote shared by the order-create page and the bulk-import
 * preview. Zone-pair pricing wins; the platform defaults are the fallback —
 * there are no per-merchant rates anymore. The effective weight cap is the
 * tighter of the merchant's admin-set limit and the rate's own max weight.
 * Pure module: lookups are injected.
 */

import type { PlatformPricingDefaults } from "@/features/platform-config/hooks/use-platform-pricing-public"
import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { applyPackageRule, type PackageRule } from "@/lib/packages"
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
  /**
   * The active bundle's current tier rule, if the merchant has one. Applied to
   * the delivery fee so this preview matches what order creation will charge
   * (`applyPackageRule` is the same helper the server uses).
   */
  packageRule?: PackageRule | null
}

export interface ParcelQuote {
  weight: number
  productCost: number
  breakdown: DeliveryChargeBreakdown | null
  /** Delivery fee actually charged, after any bundle discount. */
  deliveryCharge: number
  /** The undiscounted zone/default fee, for a "was X" display. */
  deliveryChargeBeforePackage: number
  /** True when the bundle rule actually reduced the fee. */
  packageDiscountApplied: boolean
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

  const rawDeliveryCharge = breakdown?.total ?? 0
  // The same helper the server applies at creation time, so the preview and the
  // stored charge cannot drift.
  const deliveryCharge = applyPackageRule(rawDeliveryCharge, args.packageRule)

  return {
    weight,
    productCost,
    breakdown,
    deliveryCharge,
    deliveryChargeBeforePackage: rawDeliveryCharge,
    packageDiscountApplied: deliveryCharge !== rawDeliveryCharge,
    codFee,
    cancellationFee,
    maxWeightKg,
    exceedsMax: weight > maxWeightKg,
    isZonePricing: !!zonePrice,
  }
}
