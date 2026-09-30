/**
 * Builds the `ParcelRow`s the bulk-import preview renders.
 *
 * Exists so the import gate ("is this batch submittable?") and the preview
 * display ("what does this row look like?") are computed by ONE piece of code.
 * When they were computed separately they could disagree about which rows are
 * blocked — a batch that the UI showed as ready but the server rejected.
 *
 * Pure module: every lookup is injected by the caller.
 */

import type { ResolvedRow } from "@/features/orders/bulk-import/resolve-rows"
import { quoteParcel } from "@/features/orders/quote-parcel"
import type { DeliveryCityOption } from "@/features/platform-config/hooks/use-delivery-cities"
import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { pricingUnavailableMessage, type ZoneRef } from "@/lib/pricing"
import type { PickupLocation } from "@/lib/types"
import type { ParcelRow } from "../new/types"
import { resolvedRowToParcelState } from "./row-to-parcel"

export interface ParcelRowContext {
  myLocations: PickupLocation[]
  deliveryCities: DeliveryCityOption[]
  zonePricing: ZonePricingEstimate[]
  /** Active zones, only to name the lane in the "cannot be priced" message. */
  zones: ReadonlyArray<Pick<ZoneRef, "id" | "name">>
  /** Row-line → errors the server returned for a previous submit attempt. */
  serverErrors: Record<number, string[]>
}

export interface ImportParcelRow {
  /** The CSV line this row came from — the key for edit/remove callbacks. */
  line: number
  row: ParcelRow
}

export function buildImportParcelRows(
  rows: readonly ResolvedRow[],
  ctx: ParcelRowContext,
): ImportParcelRow[] {
  return rows.map((resolved) => {
    const parcel = resolvedRowToParcelState(
      resolved,
      ctx.myLocations,
      ctx.deliveryCities,
    )
    const quote = quoteParcel({
      pickupLocationId: parcel.pickupLocationId,
      deliveryCityId: parcel.deliveryCityId,
      parcelWeightKg: parcel.parcelWeightKg,
      productCost: parcel.productCost,
      pickupLocations: ctx.myLocations,
      deliveryCities: ctx.deliveryCities,
      zonePricing: ctx.zonePricing,
      zones: ctx.zones,
    })

    const row: ParcelRow = {
      parcel,
      weight: quote.weight,
      productCost: quote.productCost,
      breakdown: quote.breakdown,
      deliveryCharge: quote.deliveryCharge,
      codFee: quote.codFee,
      exceedsMax: quote.exceedsMax,
      maxWeightKg: quote.maxWeightKg,
      errors: [...resolved.errors, ...(ctx.serverErrors[resolved.line] ?? [])],
      pricingUnavailable: quote.pricingUnavailable,
      pricingError: quote.pricingUnavailableReason
        ? pricingUnavailableMessage(
            quote.pricingUnavailableReason,
            quote.fromZone,
            quote.toZone,
          )
        : null,
    }

    return { line: resolved.line, row }
  })
}
