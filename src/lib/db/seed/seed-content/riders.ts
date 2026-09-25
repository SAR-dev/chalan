import {
  PENDING_RIDER_CREDENTIAL,
  RIDER_CREDENTIALS,
  SEED_COUNTS,
} from "./credentials"
import { WAREHOUSE_IDS } from "./warehouses"

// ---------------------------------------------------------------------------
// Deterministic: Riders (30)
// ---------------------------------------------------------------------------
export interface RiderSeedEntry {
  id: string
  name: string
  email: string
  phone: string
  password: string
  zone: string
  address: string
  nidNumber: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE" | "SUSPENDED"
  isActive: boolean
  taskType: "PICKUP" | "DELIVERY" | "BOTH"
  warehouseId: string
}

export const RIDER_IDS: Record<string, string> = Object.fromEntries(
  Array.from({ length: SEED_COUNTS.riders }, (_, i) => [
    `rider${i + 1}`,
    `RID-${String(100001 + i).padStart(6, "0")}E`,
  ]),
)

const RIDER_TASK_TYPES: ("PICKUP" | "DELIVERY" | "BOTH")[] = [
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
]

export const SEED_RIDERS: RiderSeedEntry[] = Array.from(
  { length: SEED_COUNTS.riders },
  (_, i) => ({
    id: `RID-${String(100001 + i).padStart(6, "0")}E`,
    name: `Rider ${i + 1}`,
    email: RIDER_CREDENTIALS[`rider${i + 1}`].email,
    phone: `+8801711000${String(100 + i + 1).slice(1)}`,
    password: RIDER_CREDENTIALS[`rider${i + 1}`].password,
    zone: `Zone ${(i % 5) + 1} / Area ${(i % 3) + 1}`,
    address: `${100 + i} Rider Street, Dhaka`,
    nidNumber: `123456789${String(i + 1).padStart(2, "0")}`,
    status: "ACTIVE",
    isActive: i % 5 !== 4,
    taskType: RIDER_TASK_TYPES[i],
    warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
  }),
)

// Add one PENDING rider application for testing the review flow.
SEED_RIDERS.push({
  id: "RID-100011E",
  name: "Pending Rider",
  email: PENDING_RIDER_CREDENTIAL.email,
  phone: "+8801719999999",
  password: PENDING_RIDER_CREDENTIAL.password,
  zone: "Dhaka South",
  address: "45 Application Road, Dhaka",
  nidNumber: "9999999999",
  status: "PENDING",
  isActive: false,
  taskType: "DELIVERY",
  warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
})
