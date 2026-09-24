import { MERCHANT_IDS } from "./merchants"

// ---------------------------------------------------------------------------
// Deterministic: Pickup locations (1 per merchant)
// ---------------------------------------------------------------------------
export interface PickupLocationSeedEntry {
  id: string
  merchantId: string
  label: string
  address: string
  cityId: string
}

export const SEED_PICKUP_LOCATIONS: PickupLocationSeedEntry[] = [
  {
    id: "PKL-100001E",
    merchantId: MERCHANT_IDS.merchant1,
    label: "Merchant 1 Pickup — 100 Business Street",
    address: "100 Business Street, Dhaka",
    cityId: "DC-100001E",
  },
  {
    id: "PKL-100002E",
    merchantId: MERCHANT_IDS.merchant2,
    label: "Merchant 2 Pickup — 200 Business Street",
    address: "200 Business Street, Dhaka",
    cityId: "DC-100001E",
  },
  {
    id: "PKL-100003E",
    merchantId: MERCHANT_IDS.merchant3,
    label: "Merchant 3 Pickup — 300 Business Street",
    address: "300 Business Street, Dhaka",
    cityId: "DC-100001E",
  },
  {
    id: "PKL-100004E",
    merchantId: MERCHANT_IDS.merchant4,
    label: "Merchant 4 Pickup — 400 Business Street",
    address: "400 Business Street, Dhaka",
    cityId: "DC-100001E",
  },
  {
    id: "PKL-100005E",
    merchantId: MERCHANT_IDS.merchant5,
    label: "Merchant 5 Pickup — 500 Business Street",
    address: "500 Business Street, Dhaka",
    cityId: "DC-100001E",
  },
]
