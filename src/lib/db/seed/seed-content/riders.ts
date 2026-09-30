import type { RiderVehicleType } from "@/lib/types"
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
  /**
   * Optional. Most seeded riders deliberately have none, so a freshly seeded
   * database shows the same "Not recorded" gap a real one would — a fleet where
   * every rider already has a vehicle is the case the UI has to handle least and
   * the one a reviewer is most likely to be fooled by.
   */
  vehicleType?: RiderVehicleType | null
  vehiclePlate?: string | null
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

/**
 * Vehicles for a handful of seeded riders, indexed by rider number.
 *
 * Sparse on purpose. Two riders get a plate-requiring vehicle, one gets a
 * plate-less one, and the other twenty-seven get nothing — so the list, the
 * detail page and the assign dialogs are each exercised in both their "declared"
 * and "not declared" states without a special-case fixture.
 */
const RIDER_VEHICLES: Record<
  number,
  { vehicleType: RiderVehicleType; vehiclePlate: string | null }
> = {
  1: { vehicleType: "BIKE", vehiclePlate: "DHAKA-11111" },
  2: { vehicleType: "BICYCLE", vehiclePlate: null },
  3: { vehicleType: "VAN", vehiclePlate: "DHAKA-22222" },
}

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
    vehicleType: RIDER_VEHICLES[i + 1]?.vehicleType ?? null,
    vehiclePlate: RIDER_VEHICLES[i + 1]?.vehiclePlate ?? null,
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
