import type { RiderTaskType, RiderVehicleType } from "@/lib/types"

// Shared labels + descriptions for the rider task-type selector, used by both
// the create and edit rider dialogs and the riders tables.
export const TASK_TYPE_OPTIONS: {
  value: RiderTaskType
  label: string
  description: string
}[] = [
  {
    value: "PICKUP",
    label: "Pickup",
    description: "Collects parcels from merchants",
  },
  {
    value: "DELIVERY",
    label: "Delivery",
    description: "Runs the final mile to recipients",
  },
  {
    value: "BOTH",
    label: "Pickup & delivery",
    description: "Handles either leg",
  },
]

export const taskTypeLabel = (value: RiderTaskType) =>
  TASK_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value

/**
 * Options for the rider vehicle selector, in the order an admin would scan them
 * — smallest to largest. Ordering is the point: the admin is answering "can
 * this rider carry what I am about to assign", and that question is asked by
 * walking up the list, so a randomised or alphabetical order would defeat it.
 */
export const VEHICLE_TYPE_OPTIONS: {
  value: RiderVehicleType
  label: string
  description: string
}[] = [
  {
    value: "FOOT",
    label: "On foot",
    description: "Carries parcels by hand",
  },
  {
    value: "BICYCLE",
    label: "Bicycle",
    description: "Pedal cargo or a pannier",
  },
  {
    value: "BIKE",
    label: "Motorbike",
    description: "Standard motorbike",
  },
  {
    value: "CAR",
    label: "Car",
    description: "Car boot or hatchback",
  },
  {
    value: "VAN",
    label: "Van",
    description: "Larger multi-parcel van",
  },
  {
    value: "PICKUP_TRUCK",
    label: "Pickup truck",
    description: "Open bed for bulky freight",
  },
]

/**
 * Vehicle types that are meaningless without a registration number. A car or a
 * truck on the road is identifiable; a bicycle is not, so asking for its plate
 * would just produce a field nobody can fill truthfully.
 */
export const VEHICLE_TYPES_REQUIRING_PLATE: ReadonlySet<RiderVehicleType> =
  new Set<RiderVehicleType>(["BIKE", "CAR", "VAN", "PICKUP_TRUCK"])

export const vehicleTypeLabel = (value: RiderVehicleType) =>
  VEHICLE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
