import type { OrderStatus } from "@/lib/types"

/**
 * The statuses a warehouse admin can no longer act on.
 *
 * Shared by the Completed page (which lists them) and the Overview's stat
 * query (which counts them out of the way) so the two can never disagree about
 * what "closed" means.
 *
 * RETURNED is in here because it is terminal: `return` is the transition that
 * sets it and nothing leaves it. It used to sit on the Exceptions page under a
 * "Resolved" tab, which was ownership by history rather than by state — the
 * page's own purpose is "parcels you can still resolve", and a resolved parcel
 * has nothing to resolve. See TODO.md decision #1.
 *
 * FAILED_ATTEMPT is deliberately absent: it is not closed, it is stuck.
 */
export const COMPLETED_STATUSES = [
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
] as const satisfies readonly OrderStatus[]
