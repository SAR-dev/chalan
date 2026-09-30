import type { SWRConfiguration } from "swr"

// Carries a server-provided error message through a thrown rejection so
// optimistic mutations can roll back (via SWR) and still hand the caller the
// same `{ ok: false, error }` shape the old context returned.
export class ApiError extends Error {}

// Every resource endpoint the old loadAll() fetched, in one place. Used by the
// data-error aggregator to subscribe to / revalidate the full set. All of these
// are paginated list endpoints, so the aggregator probes them with `limit=1`.
export const RESOURCE_KEYS = [
  "/api/team",
  "/api/merchants",
  "/api/orders",
  "/api/payouts",
  "/api/pickup-locations",
  "/api/riders",
  "/api/warehouses",
  "/api/audit-logs",
  "/api/email-logs",
] as const

// Shared fetcher for every resource hook. Throws on non-2xx so SWR surfaces
// the failure through its `error` channel (mirrors the old loadAll() behavior
// of treating any failed response as a failed load).
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

// revalidateOnFocus is disabled to avoid disruptive table refreshes while an
// admin is mid-action. revalidateOnReconnect is enabled so that data is
// refreshed automatically after a network drop — preventing stale reads when
// the tab comes back online after connectivity is restored.
// dedupingInterval prevents duplicate API calls when multiple components mount
// simultaneously (e.g. tab switches or page re-renders).
// keepPreviousData holds the last successful response while a new key (page,
// search, filter, sort) is in flight. Without it SWR reports `data: undefined`
// for the new key, which every table renders as an empty state or skeleton —
// so paging through results appears to delete the rows. Note this also means
// `isLoading` stays false across a key change; consumers that need a busy
// signal must read `isValidating` (surfaced as `isRefreshing` by the feature
// hooks) rather than relying on `isLoading` alone.
export const swrOptions: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
  keepPreviousData: true,
}
