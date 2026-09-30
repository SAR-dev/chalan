import { RIDER_VEHICLE_TYPE_LABELS } from "@/lib/constants"
import type { Rider } from "@/lib/types"

/**
 * One-line description of a rider's vehicle, for display beside their name.
 *
 * Returns null when no vehicle has been declared. That is a real state, not a
 * gap to paper over: a rider with no vehicle recorded is someone the admin
 * should be able to see as unstated, rather than reading as "on foot" because
 * that is what the absence happens to sort to first.
 *
 * Both parts are optional in practice. A type without a plate ("Motorbike") is
 * a complete answer; a plate without a type is a typed but unclassified vehicle,
 * which is unusual but should not render as an empty string.
 */
export function riderVehicleLabel(
  rider: Pick<Rider, "vehicleType" | "vehiclePlate">,
): string | null {
  const type = rider.vehicleType
    ? RIDER_VEHICLE_TYPE_LABELS[rider.vehicleType]
    : null
  const plate = rider.vehiclePlate?.trim() || null
  if (type && plate) return `${type} · ${plate}`
  return type ?? plate
}

/** True when a rider has declared any vehicle detail. */
export function hasRiderVehicle(
  rider: Pick<Rider, "vehicleType" | "vehiclePlate">,
): boolean {
  return riderVehicleLabel(rider) !== null
}
