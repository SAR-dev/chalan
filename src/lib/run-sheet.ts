/**
 * Turning a rider's committed parcels into a suggested drop order.
 *
 * A rider holding six parcels across three cities has to decide the order of
 * them, and the queue simply listed them by parcel code — which is creation
 * order, so it interleaves cities and sends the rider back and forth for no
 * reason. This is the part of route optimisation the data model can actually
 * support, and it is worth being exact about what that is:
 *
 * **It minimises zone changes, not distance.** The only geographic structure
 * stored anywhere is `order.deliveryCityId` → `delivery_city.zoneId`. There are
 * no coordinates, no geocoding, no map provider and no rider position, so
 * within a zone this plan has nothing to go on and falls back to parcel age.
 * That is a genuine win when a rider's run spans several zones — a zone is a
 * real contiguous area — and no win at all inside one. Calling it street
 * routing would be a lie; calling it zone batching is not.
 *
 * Because every zone is visited exactly once, contiguously, the result is
 * provably optimal for its objective: any run of the same parcels that changes
 * zone at least once per zone cannot do better than `zones - 1` changes. The
 * visit *order* between zones is therefore a presentation choice, and it is
 * made the way a dispatcher would make it — the longest run first — while
 * staying deterministic so the rider sees the same sheet on every reload.
 *
 * Nothing is persisted. The sheet is a pure function of the rider's current
 * open parcels, so it cannot go stale, needs no migration, and needs no "apply"
 * step to stay correct.
 */

export interface RunSheetOrder {
  id: string
  /** Destination zone via `delivery_city.zoneId`; null when unset. */
  zoneId: string | null
  /** Destination city name, for the stop list. */
  cityName: string | null
}

export interface RunStop {
  orderId: string
  /** 1-based position in the suggested run. */
  sequence: number
  zoneId: string | null
  zoneName: string | null
  cityName: string | null
}

export interface RunSheet {
  stops: RunStop[]
  /** How many times the run changes zone. Zero for a single-zone run. */
  zoneHops: number
  /** Distinct destinations in the run, counting zoneless parcels as one. */
  zoneCount: number
}

export interface BuildRunSheetInput {
  orders: readonly RunSheetOrder[]
  zoneNames?: ReadonlyMap<string, string>
}

/** Sorts parcel ids ascending; ids are zero-padded sequences, so this is age. */
function byId(a: { id: string }, b: { id: string }) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function buildRunSheet({
  orders,
  zoneNames = new Map(),
}: BuildRunSheetInput): RunSheet {
  const buckets = new Map<string | null, RunSheetOrder[]>()
  for (const order of orders) {
    const bucket = buckets.get(order.zoneId)
    if (bucket) bucket.push(order)
    else buckets.set(order.zoneId, [order])
  }

  // Longest run first so the biggest chunk of the day is settled before the
  // tail; `zoneId` ascending as the tie-break keeps the output stable.
  const orderedZones = [...buckets.entries()].sort(
    ([zoneA, runA], [zoneB, runB]) =>
      runB.length !== runA.length
        ? runB.length - runA.length
        : (zoneA ?? "") < (zoneB ?? "")
          ? -1
          : (zoneA ?? "") > (zoneB ?? "")
            ? 1
            : 0,
  )

  const stops: RunStop[] = []
  for (const [zoneId, run] of orderedZones) {
    for (const order of [...run].sort(byId)) {
      stops.push({
        orderId: order.id,
        sequence: stops.length + 1,
        zoneId,
        zoneName: zoneId ? (zoneNames.get(zoneId) ?? null) : null,
        cityName: order.cityName,
      })
    }
  }

  return {
    stops,
    zoneCount: orderedZones.length,
    zoneHops: Math.max(0, orderedZones.length - 1),
  }
}
