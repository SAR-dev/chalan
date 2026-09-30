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
  productCost: string
  deliveryType: DeliveryType
  deliveryMapLink: string
  merchantNote: string
}

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
