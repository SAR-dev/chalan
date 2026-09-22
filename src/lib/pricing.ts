import { CURRENCY_SUFFIX } from "@/lib/constants"
import type { Merchant } from "@/lib/types"

export interface DeliveryChargeBreakdown {
  baseRate: number
  billableExtraKg: number
  extraWeightCharge: number
  total: number
  exceedsMax: boolean
}

/**
 * Delivery charge logic (Phase 2/3 pricing rules):
 * - base rate covers the first `freeWeightKg`
 * - any weight above the free allowance is charged at `extraRatePerKg`,
 *   rounded up to the next whole kg
 * - orders above `maxWeightKg` are rejected
 */
export function calcDeliveryCharge(
  pricing: Pick<
    Merchant,
    "baseRate" | "extraRatePerKg" | "freeWeightKg" | "maxWeightKg"
  >,
  weightKg: number,
): DeliveryChargeBreakdown {
  const exceedsMax = weightKg > pricing.maxWeightKg
  const extraKg = Math.max(0, weightKg - pricing.freeWeightKg)
  const billableExtraKg = Math.ceil(extraKg)
  const extraWeightCharge = billableExtraKg * pricing.extraRatePerKg
  const total = pricing.baseRate + extraWeightCharge
  return {
    baseRate: pricing.baseRate,
    billableExtraKg,
    extraWeightCharge,
    total,
    exceedsMax,
  }
}

export function formatTk(amount: number): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${CURRENCY_SUFFIX}`
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
  return Math.round(productCost * (codFeePercentage / 100) * 100) / 100
}

/**
 * Calculate merchant earnings for an order.
 * Earnings = COD amount - delivery fee - COD fee
 */
export function calcMerchantEarnings(
  productCost: number,
  deliveryFee: number,
  codFee: number,
): number {
  return Math.max(0, productCost - deliveryFee - codFee)
}
