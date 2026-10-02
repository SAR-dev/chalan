import {
  Bike,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react"
import type { ComponentType } from "react"
import { formatDateTime } from "@/lib/format"
import type { Order, OrderStatus } from "@/lib/types"

/**
 * The delivery timeline: one definition of the six steps, their ranks, their
 * icons and their timestamps.
 *
 * This exists because the public tracking page and the admin order table each
 * kept their **own** copy of all three. They drifted: the two `formatStamp`s
 * disagreed about locale and time zone, so one order could show different
 * times for the same event on two screens (ROADMAP R3.3). Anything that
 * describes the order lifecycle has to live here, in one place.
 *
 * Deliberately free of server imports — `track/[id]/lib.ts` pulls in `db`, and
 * the admin timeline is a client component, so that module could never have
 * been the shared home.
 */

export type StepKey =
  | "PLACED"
  | "APPROVED"
  | "PICKED_UP"
  | "IN_WAREHOUSE"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"

/** Where a status sits in the lifecycle, for "which step is current". */
export const STATUS_RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  PICKED_UP: 2,
  IN_WAREHOUSE: 3,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  FAILED_ATTEMPT: 4,
  RETURNED: 4,
  CANCELLED: 0,
}

export interface TimelineStep {
  key: StepKey
  label: string
  /** Wording for a reader who is *not* the recipient (ops, support). */
  description: string
  /**
   * Wording for the recipient's own tracking page, where the reader *is* the
   * recipient. Only one step needs it: everywhere else the two voices happen
   * to be the same sentence.
   */
  descriptionForRecipient?: string
  icon: ComponentType<{ className?: string }>
  rank: number
  timestamp: (o: Order) => string | Date | null | undefined
}

export const STEPS: TimelineStep[] = [
  {
    key: "PLACED",
    label: "Order placed",
    description: "Merchant created the shipment",
    icon: ClipboardCheck,
    rank: 0,
    timestamp: (o) => o.createdAt,
  },
  {
    key: "APPROVED",
    label: "Approved",
    description: "Verified and ready for pickup",
    icon: PackageCheck,
    rank: 1,
    timestamp: (o) => o.approvedAt,
  },
  {
    key: "PICKED_UP",
    label: "Picked up",
    description: "Rider collected from merchant",
    icon: Bike,
    rank: 2,
    timestamp: (o) => o.pickedUpAt,
  },
  {
    key: "IN_WAREHOUSE",
    label: "At sorting hub",
    description: "Arrived at the delivery hub",
    icon: Warehouse,
    rank: 3,
    timestamp: (o) => o.receivedAtWarehouseAt,
  },
  {
    key: "OUT_FOR_DELIVERY",
    label: "Out for delivery",
    description: "Rider is heading to the recipient",
    // The tracking page is read by the person waiting for the parcel, so it
    // speaks to them directly.
    descriptionForRecipient: "Rider is heading to you now",
    icon: Truck,
    rank: 4,
    timestamp: (o) => o.outForDeliveryAt ?? o.dispatchedAt,
  },
  {
    key: "DELIVERED",
    label: "Delivered",
    description: "Handed to the recipient",
    icon: CheckCircle2,
    rank: 5,
    timestamp: (o) => o.deliveredAt,
  },
]

/** Who the screen is addressed to. Only one step words them differently. */
export type TimelineVoice = "recipient" | "ops"

/**
 * The step's wording for the given reader.
 *
 * One function rather than a `??` at each call site, so "who is this screen
 * addressed to?" is answered where the copy is defined rather than being
 * re-derived — and re-guessed — in every consumer. The voice is a literal, not
 * a boolean, so `stepDescription(step, "recipient")` still reads as English at
 * the call site.
 */
export function stepDescription(
  step: TimelineStep,
  voice: TimelineVoice,
): string {
  return voice === "recipient"
    ? (step.descriptionForRecipient ?? step.description)
    : step.description
}

/**
 * Pinned to the business zone and locale. Two implementations of this used to
 * exist and disagree (ROADMAP R3.3); there is now exactly one.
 */
export function formatStamp(iso?: string | Date | null) {
  if (!iso) return null
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return null
  return formatDateTime(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
