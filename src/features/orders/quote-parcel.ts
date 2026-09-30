/**
 * Per-parcel charge quote shared by the order-create page and the bulk-import
 * preview.
 *
 * Zone-pair pricing is the ONLY source — there are no platform defaults and no
 * per-merchant rates, so a lane with no `zone_pricing` row cannot be quoted at
 * all. That is reported as `pricingUnavailable` with the reason the server will
 * give, rather than quoted at TK 0 and rejected on submit. The effective weight
 * cap is the tighter of the merchant's admin-set limit and the rate's own max
 * weight. Pure module: lookups are injected.
 */

import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { applyPackageRule, type PackageRule } from "@/lib/packages"
import {
  calcCodFee,
  calcDeliveryCharge,
  type DeliveryChargeBreakdown,
  type PricingUnavailableReason,
  type ZoneRef,
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
  /**
   * Active delivery zones, used only to name the lane in the "cannot be priced"
   * message. Optional — without it the message falls back to "the pickup zone".
   */
  zones?: ReadonlyArray<Pick<ZoneRef, "id" | "name">>
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
  /** The undiscounted zone fee, for a "was X" display. */
  deliveryChargeBeforePackage: number
  /** True when the bundle rule actually reduced the fee. */
  packageDiscountApplied: boolean
  codFee: number
  cancellationFee: number
  /**
   * The route's own weight limit — `zone_pricing.maxWeightKg`, and nothing
   * else: there is no per-merchant cap. `0` when the lane has no rate, in which
   * case `pricingUnavailable` is what the form must show (not a limit).
   */
  maxWeightKg: number
  exceedsMax: boolean
  /**
   * True when no `zone_pricing` row covers this lane. The fees below are all 0
   * in that case — the form must not submit, and must show the reason instead.
   */
  pricingUnavailable: boolean
  /** Why the lane cannot be priced; `null` when it can. */
  pricingUnavailableReason: PricingUnavailableReason | null
  /** Origin zone, named where known — `null` when it could not be resolved. */
  fromZone: ZoneRef | null
  /** Destination zone, named where known — `null` when it could not be resolved. */
  toZone: ZoneRef | null
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

  // Name the lane where the zone list is available, so the "cannot be priced"
  // message can say "Dhaka → Gazipur" rather than something generic.
  const zoneRef = (zoneId: string | null): ZoneRef | null => {
    if (!zoneId) return null
    const name = args.zones?.find((z) => z.id === zoneId)?.name
    return name ? { id: zoneId, name } : null
  }
  const fromZone = zoneRef(originZoneId)
  const toZone = zoneRef(destZoneId)

  // Classify why the lane is unpriceable, in the same order/vocabulary as the
  // server's `resolveRoutePricing`, so the message matches what submit returns.
  let reason: PricingUnavailableReason | null = null
  if (!originZoneId) {
    reason = "origin-zone-unknown"
  } else if (!args.deliveryCityId || !destCity) {
    reason = "destination-city-unknown"
  } else if (!destZoneId) {
    reason = "destination-zone-unknown"
  }

  const pricing =
    originZoneId && destZoneId
      ? (args.zonePricing.find(
          (z) => z.fromZoneId === originZoneId && z.toZoneId === destZoneId,
        ) ?? null)
      : null
  if (!pricing && !reason) reason = "no-pricing-for-lane"

  const pricingUnavailable = pricing === null
  const breakdown = pricing ? calcDeliveryCharge(pricing, weight) : null
  const codFee = pricing
    ? calcCodFee(productCost, pricing.codFeePercentage ?? 1)
    : 0
  const cancellationFee = pricing?.cancellationFee ?? 0
  // The route's rate is the only weight limit — there is no per-merchant cap
  // left. With no lane rate there is no limit to show, so `exceedsMax` stays
  // false and `pricingUnavailable` carries the message instead of a bogus
  // "exceeds 0 KG max".
  const maxWeightKg = pricing?.maxWeightKg ?? 0
  const exceedsMax = pricing !== null && weight > pricing.maxWeightKg

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
    exceedsMax,
    pricingUnavailable,
    pricingUnavailableReason: pricingUnavailable ? reason : null,
    fromZone,
    toZone,
  }
}
