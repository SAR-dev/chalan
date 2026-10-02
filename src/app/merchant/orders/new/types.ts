import type { DeliveryChargeBreakdown } from "@/lib/pricing"
import type { DeliveryType } from "@/lib/types"

export interface ParcelState {
  id: string
  pickupLocationId: string
  recipientName: string
  recipientPhone: string
  deliveryCityId: string
  deliveryAddress: string
  parcelWeightKg: string
  itemType: string
  productCost: string
  deliveryType: DeliveryType
  deliveryMapLink: string
  merchantNote: string
}

/** The controls a parcel's validation can be blamed on. */
export type ParcelField = keyof ParcelState

/**
 * One parcel's validation, captured when the form was submitted.
 *
 * It is a snapshot rather than something recomputed on every keystroke because
 * `FormErrors` takes focus whenever its error count changes — re-deriving the
 * messages live would pull focus out of the field the merchant is in the middle
 * of correcting. Every other form in the app freezes errors on submit for the
 * same reason, which is why this is keyed by field rather than being a list
 * pasted at the bottom of the card.
 */
export type ParcelValidation = Partial<Record<ParcelField, string>>

export interface ParcelRow {
  parcel: ParcelState
  weight: number
  productCost: number
  breakdown: DeliveryChargeBreakdown | null
  deliveryCharge: number
  codFee: number
  exceedsMax: boolean
  /**
   * The route's own weight limit — `zone_pricing.maxWeightKg`, and nothing
   * else. `0` when the lane is unpriced (the pricing error is what shows then).
   */
  maxWeightKg: number
  /**
   * Messages for this row that belong to no single control: rows the CSV
   * resolver rejected, and issues the server returned for a previous attempt.
   * Field-level validation lives in `ParcelValidation`, keyed by control.
   */
  errors: string[]
  /**
   * No `zone_pricing` row covers this lane. Delivery charges are per-lane with
   * no platform fallback, so such a parcel cannot be created — the form blocks
   * the submit and `pricingError` says which lane an admin must configure.
   */
  pricingUnavailable: boolean
  /** Actionable explanation; non-null exactly when `pricingUnavailable`. */
  pricingError: string | null
}
