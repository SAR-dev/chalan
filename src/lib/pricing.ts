import { toPaisa } from "@/lib/balance-ledger"
import { formatMoney } from "@/lib/format"

export interface DeliveryChargeBreakdown {
  baseRate: number
  billableExtraKg: number
  extraWeightCharge: number
  total: number
  exceedsMax: boolean
}

/** The rate fields a delivery charge needs (a `zone_pricing` row). */
export interface DeliveryRate {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
}

/** A zone, identified well enough to name in an error or a coverage list. */
export interface ZoneRef {
  id: string
  name: string
}

/**
 * Why a route could not be priced.
 *
 * These are distinct admin problems with distinct fixes, so they are reported
 * separately rather than collapsed into one "pricing not configured" — a lane
 * with no row needs a rate, while an unmapped city needs a zone assignment
 * first. Lives here (not in `order-pricing.ts`) so client quote code can use the
 * same vocabulary as the server without importing the db layer.
 */
export type PricingUnavailableReason =
  /** Both zones resolved, but no `zone_pricing` row exists for the pair. */
  | "no-pricing-for-lane"
  /** The pickup city's zone is unknown (no matching city, or no zone on it). */
  | "origin-zone-unknown"
  /** No delivery city was chosen, or it matches no `delivery_city`. */
  | "destination-city-unknown"
  /** The delivery city exists but has no zone assigned. */
  | "destination-zone-unknown"

/**
 * A one-line, actionable explanation for a lane that cannot be priced.
 *
 * Used by order creation and by the client quote code (live quote, import
 * preview, pricing calculator), so a merchant sees the same sentence they would
 * get back if they submitted anyway — rather than a silent TK 0 quote. The bulk
 * import route returns the same pair name but prefixes it with a row count,
 * because one rejection there covers the whole batch.
 */
export function pricingUnavailableMessage(
  reason: PricingUnavailableReason,
  fromZone: ZoneRef | null,
  toZone: ZoneRef | null,
): string {
  switch (reason) {
    case "no-pricing-for-lane":
      return `No delivery pricing is configured for ${fromZone?.name ?? "the pickup zone"} → ${toZone?.name ?? "the delivery zone"}. Configure the zone pair before creating orders on this lane.`
    case "origin-zone-unknown":
      return "The pickup city's zone is not set, so the origin zone cannot be determined. Assign the pickup city's zone first."
    case "destination-city-unknown":
      return "The delivery city is unknown, so its destination zone cannot be determined. Pick a configured delivery city."
    case "destination-zone-unknown":
      return `The delivery city has no zone assigned, so ${fromZone?.name ?? "the origin"} → ${toZone?.name ?? "the destination"} cannot be priced. Assign the delivery city's zone first.`
  }
}

/**
 * Delivery charge logic (Phase 2/3 pricing rules):
 * - base rate covers the first `freeWeightKg`
 * - any weight above the free allowance is charged at `extraRatePerKg`,
 *   rounded up to the next whole kg
 * - orders above `maxWeightKg` are rejected
 */
export function calcDeliveryCharge(
  pricing: DeliveryRate,
  weightKg: number,
): DeliveryChargeBreakdown {
  const exceedsMax = weightKg > pricing.maxWeightKg
  const extraKg = Math.max(0, weightKg - pricing.freeWeightKg)
  const billableExtraKg = Math.ceil(extraKg)
  // Money is rounded to paisa at every computation boundary so
  // the stored fees/earnings can never carry float noise.
  const extraWeightCharge = toPaisa(billableExtraKg * pricing.extraRatePerKg)
  const total = toPaisa(pricing.baseRate + extraWeightCharge)
  return {
    baseRate: pricing.baseRate,
    billableExtraKg,
    extraWeightCharge,
    total,
    exceedsMax,
  }
}

export function formatTk(amount: number): string {
  // Delegates so locale, grouping and suffix live in one place.
  return formatMoney(amount, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/**
 * COD fee calculation — percentage of product cost (cash collection service).
 * @param productCost - Amount collected from recipient (COD amount)
 * @param codFeePercentage - Merchant's COD fee percentage (e.g., 1 for 1%)
 */
export function calcCodFee(
  productCost: number,
  codFeePercentage: number,
): number {
  return toPaisa(productCost * (codFeePercentage / 100))
}

/**
 * Calculate merchant earnings for an order.
 * Earnings = COD amount - delivery fee - COD fee
 *
 * Signed on purpose: when the fees exceed the COD collected the
 * merchant is net-negative, and clamping to 0 would hide that debt from
 * payouts and reports. The ledger already stores the true signed balance.
 */
export function calcMerchantEarnings(
  productCost: number,
  deliveryFee: number,
  codFee: number,
): number {
  return toPaisa(productCost - deliveryFee - codFee)
}
