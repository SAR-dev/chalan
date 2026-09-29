import { toPaisa } from "@/lib/balance-ledger"
import { formatTk } from "@/lib/pricing"

// =============================================================================
// Package (prepaid bundle) rule engine — PURE and client-safe.
//
// No database imports here: the same helpers run on the server (order
// creation) and in the browser (the merchant's rate calculator) so both always
// agree. Persistence lives in `src/lib/order-pricing.ts`.
// =============================================================================

export type PackageRuleType = "FLAT" | "PERCENT_OFF"

export interface PackageRule {
  ruleType: PackageRuleType
  ruleValue: number
}

export interface PackageTierRule extends PackageRule {
  id: string
  orderCount: number
  sortOrder: number
}

/**
 * The tier unlocked after a given number of orders. `orderCount` is the
 * cumulative order threshold, so the most specific tier is the one with the
 * greatest `orderCount` that is still `<= ordersUsed`. Returns `null` when no
 * tier is unlocked yet.
 */
export function pickTierForCount<T extends { orderCount: number }>(
  tiers: readonly T[],
  ordersUsed: number,
): T | null {
  let picked: T | null = null
  for (const tier of tiers) {
    if (tier.orderCount > ordersUsed) continue
    if (!picked || tier.orderCount > picked.orderCount) picked = tier
  }
  return picked
}

/** The next tier the merchant will unlock, for progress UI. */
export function nextTierForCount<T extends { orderCount: number }>(
  tiers: readonly T[],
  ordersUsed: number,
): T | null {
  let next: T | null = null
  for (const tier of tiers) {
    if (tier.orderCount <= ordersUsed) continue
    if (!next || tier.orderCount < next.orderCount) next = tier
  }
  return next
}

/**
 * Adjust a zone delivery fee by a package rule.
 *
 * - `FLAT` replaces the fee with a fixed amount, but never charges *more* than
 *   the zone fee — a package can only ever reduce what the merchant pays.
 * - `PERCENT_OFF` reduces the fee by the percentage.
 *
 * The result is clamped to `[0, zoneFee]` and rounded to paisa (ROADMAP P0.4)
 * so the stored fee carries no float noise.
 */
export function applyPackageRule(
  zoneFee: number,
  rule: PackageRule | null | undefined,
): number {
  const fee = toPaisa(zoneFee)
  if (!rule) return fee
  if (rule.ruleType === "FLAT") {
    return toPaisa(Math.min(fee, Math.max(0, rule.ruleValue)))
  }
  const percent = Math.min(100, Math.max(0, rule.ruleValue))
  return toPaisa(fee * (1 - percent / 100))
}

/** Human-readable tier label, e.g. `Flat 50 Tk` or `10% off delivery`. */
export function tierLabel(tier: PackageRule): string {
  return tier.ruleType === "FLAT"
    ? `Flat ${formatTk(tier.ruleValue)}`
    : `${tier.ruleValue}% off delivery`
}
