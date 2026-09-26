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
  errors: string[]
  isZonePricing: boolean
}
