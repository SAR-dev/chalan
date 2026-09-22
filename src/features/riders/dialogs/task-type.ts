import type { RiderTaskType } from "@/lib/types"

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
