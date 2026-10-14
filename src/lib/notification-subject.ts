import { eq } from "drizzle-orm"
import { dbRead } from "@/lib/db"
import { deliveryCity } from "@/lib/db/schema"

/**
 * The one line a notification shows to identify its parcel.
 *
 * An order reference on its own is useless in a list: `ORD-100163` tells a
 * merchant nothing, so twenty of them are twenty identical rows and every one
 * has to be opened to find out which parcel it was. "Notify Recipient →
 * Barisal" answers it without a click, and is snapshotted at event time because
 * `orderId` carries no foreign key — the notification outlives the order, so this
 * is the only remaining record of what it was about.
 */
export interface SubjectOrder {
  recipientName?: string | null
  deliveryCityId?: string | null
}

/**
 * Cache of `delivery_city` lookups for the life of one request.
 *
 * Emitting for a batch means one insert per order, and the recipient lookup is
 * already memoised per merchant. Without this, resolving the city would add a
 * SELECT per order — the exact per-row growth the batch-cost guards in
 * `transitions.spec.ts` exist to prevent.
 *
 * A memo, not a request-scoped cache: two orders for the same city must resolve
 * it once between them.
 */
export function createCityNameResolver(): (
  cityId: string | null | undefined,
) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>()

  return (cityId) => {
    if (!cityId) return Promise.resolve(null)

    const hit = cache.get(cityId)
    if (hit) return hit

    const pending = dbRead
      .select({ name: deliveryCity.name })
      .from(deliveryCity)
      .where(eq(deliveryCity.id, cityId))
      .limit(1)
      .then((rows) => rows[0]?.name ?? null)
      // A lookup that fails must not fail the transition that raised the event.
      .catch(() => null)

    cache.set(cityId, pending)
    return pending
  }
}

/**
 * `"Notify Recipient → Barisal"`.
 *
 * Degrades rather than throwing: a missing recipient name yields just the city,
 * a missing city just the name, and neither yields null — which the caller
 * stores as null so the UI falls back to the order code it already shows.
 */
export async function buildNotificationSubject(
  order: SubjectOrder,
  resolveCityName: (
    cityId: string | null | undefined,
  ) => Promise<string | null>,
): Promise<string | null> {
  const recipient = order.recipientName?.trim() || null
  if (!order.deliveryCityId) {
    return recipient
  }

  // Guarded here as well as inside the factory: this function is exported, and a
  // caller passing a bare resolver should not have to reproduce the factory's
  // contract to get the null-city and failing-lookup behaviour.
  const city = await resolveCityName(order.deliveryCityId).catch(() => null)

  if (!recipient && !city) return null
  if (!recipient) return city
  if (!city) return recipient
  return `${recipient} → ${city}`
}
