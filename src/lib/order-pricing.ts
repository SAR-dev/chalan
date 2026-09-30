import { and, eq } from "drizzle-orm"
import { db, dbRead } from "@/lib/db"
import {
  deliveryCity,
  deliveryZone,
  merchantPackage,
  pricingPackage,
  pricingPackageTier,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import {
  type PackageRule,
  type PackageTierRule,
  pickTierForCount,
} from "@/lib/packages"
import type { PricingUnavailableReason, ZoneRef } from "@/lib/pricing"

export interface ResolvedPricing {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
  cancellationFee: number
}

/** Re-exported so callers can name the failure vocabulary. */
export type { PricingUnavailableReason, ZoneRef } from "@/lib/pricing"

export type ResolveRoutePricingResult =
  | { ok: true; pricing: ResolvedPricing }
  | {
      ok: false
      reason: PricingUnavailableReason
      /** Set when both zones are known — names the pair that needs a rate. */
      fromZone: ZoneRef | null
      toZone: ZoneRef | null
    }

/**
 * Resolves the pricing for a route from the `zone_pricing` matrix (origin = the
 * pickup warehouse's city zone, destination = the delivery city's zone).
 *
 * There is deliberately no platform-level fallback: zone pricing is the single
 * source for delivery, COD and cancellation fees, so an unconfigured lane is a
 * configuration gap that must surface rather than quietly inherit a rate. Callers
 * decide what to do — order creation rejects, while pickup re-pricing keeps the
 * fee the order already snapshotted (see `features/orders/transitions.ts`).
 *
 * Used by order creation and by pickup re-pricing. `api/orders/bulk` does not
 * call this: it pre-fetches the whole matrix and looks the lane up in memory,
 * so it re-implements the same "is this lane configured?" test and must keep
 * classifying a lane identically.
 */
export async function resolveRoutePricing(
  originWarehouseId: string,
  deliveryCityId: string | null,
): Promise<ResolveRoutePricingResult> {
  const [w] = await dbRead
    .select({ city: warehouse.city })
    .from(warehouse)
    .where(eq(warehouse.id, originWarehouseId))
    .limit(1)

  const [origCity] = w?.city
    ? await dbRead
        .select({ zone: deliveryZone })
        .from(deliveryCity)
        .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
        .where(eq(deliveryCity.name, w.city))
        .limit(1)
    : []

  if (!origCity?.zone) {
    return {
      ok: false,
      reason: "origin-zone-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  if (!deliveryCityId) {
    return {
      ok: false,
      reason: "destination-city-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  const [destCity] = await dbRead
    .select({ zone: deliveryZone })
    .from(deliveryCity)
    .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
    .where(eq(deliveryCity.id, deliveryCityId))
    .limit(1)

  if (!destCity) {
    return {
      ok: false,
      reason: "destination-city-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  if (!destCity.zone) {
    return {
      ok: false,
      reason: "destination-zone-unknown",
      fromZone: origCity.zone,
      toZone: null,
    }
  }

  const [zp] = await dbRead
    .select()
    .from(zonePricing)
    .where(
      and(
        eq(zonePricing.fromZoneId, origCity.zone.id),
        eq(zonePricing.toZoneId, destCity.zone.id),
      ),
    )
    .limit(1)

  if (!zp) {
    return {
      ok: false,
      reason: "no-pricing-for-lane",
      fromZone: origCity.zone,
      toZone: destCity.zone,
    }
  }

  return { ok: true, pricing: zp }
}

// =============================================================================
// Package (prepaid bundle) resolution
//
// The active bundle is per-merchant and locked with `.for("update")` on the
// order-creation path so a concurrent create cannot double-spend a tier. The
// returned snapshot is written onto the order row, freezing the rule for the
// order's lifetime (later reassignment or tier edits never move a past fee).
// =============================================================================

export type OrderPricingTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface MerchantPackageSnapshot {
  merchantPackageId: string
  packageId: string
  ordersUsed: number
  tierId: string | null
  rule: PackageRule | null
  /** All tiers, so a bulk create can resolve a rule per order as the count
   *  advances across a tier boundary. */
  tiers: PackageTierRule[]
}

interface ActiveBundleRow {
  merchantPackageId: string
  packageId: string
  ordersUsed: number
}

const ACTIVE_BUNDLE_COLUMNS = {
  merchantPackageId: merchantPackage.id,
  packageId: merchantPackage.packageId,
  ordersUsed: merchantPackage.ordersUsed,
}

const TIER_COLUMNS = {
  id: pricingPackageTier.id,
  orderCount: pricingPackageTier.orderCount,
  sortOrder: pricingPackageTier.sortOrder,
  ruleType: pricingPackageTier.ruleType,
  ruleValue: pricingPackageTier.ruleValue,
}

function snapshotFor(
  active: ActiveBundleRow,
  packageActive: boolean,
  tiers: readonly PackageTierRule[],
): MerchantPackageSnapshot | null {
  if (!packageActive) return null
  const tier = pickTierForCount(tiers, active.ordersUsed)
  return {
    merchantPackageId: active.merchantPackageId,
    packageId: active.packageId,
    ordersUsed: active.ordersUsed,
    tierId: tier?.id ?? null,
    rule: tier ? { ruleType: tier.ruleType, ruleValue: tier.ruleValue } : null,
    tiers: [...tiers],
  }
}

/** Read the merchant's active bundle (no lock) — for previews and the UI. */
export async function resolveMerchantPackageRule(
  merchantId: string,
): Promise<MerchantPackageSnapshot | null> {
  const [active] = await dbRead
    .select(ACTIVE_BUNDLE_COLUMNS)
    .from(merchantPackage)
    .where(
      and(
        eq(merchantPackage.merchantId, merchantId),
        eq(merchantPackage.isActive, true),
      ),
    )
    .limit(1)
  if (!active) return null

  const [pkg] = await dbRead
    .select({ isActive: pricingPackage.isActive })
    .from(pricingPackage)
    .where(eq(pricingPackage.id, active.packageId))
    .limit(1)

  const tiers = await dbRead
    .select(TIER_COLUMNS)
    .from(pricingPackageTier)
    .where(eq(pricingPackageTier.packageId, active.packageId))

  return snapshotFor(active, pkg?.isActive ?? false, tiers)
}

/**
 * Lock the merchant's active bundle row and resolve its tier. MUST be called
 * inside a transaction on the order-creation path so the `ordersUsed` bump is
 * serialized against concurrent creates.
 */
export async function lockAndResolveMerchantPackageRule(
  tx: OrderPricingTx,
  merchantId: string,
): Promise<MerchantPackageSnapshot | null> {
  const [active] = await tx
    .select(ACTIVE_BUNDLE_COLUMNS)
    .from(merchantPackage)
    .where(
      and(
        eq(merchantPackage.merchantId, merchantId),
        eq(merchantPackage.isActive, true),
      ),
    )
    .for("update")
    .limit(1)
  if (!active) return null

  const [pkg] = await tx
    .select({ isActive: pricingPackage.isActive })
    .from(pricingPackage)
    .where(eq(pricingPackage.id, active.packageId))
    .limit(1)

  const tiers = await tx
    .select(TIER_COLUMNS)
    .from(pricingPackageTier)
    .where(eq(pricingPackageTier.packageId, active.packageId))

  return snapshotFor(active, pkg?.isActive ?? false, tiers)
}
