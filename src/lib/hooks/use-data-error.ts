"use client"

import { useCallback, useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, RESOURCE_KEYS, swrOptions } from "@/lib/hooks/fetcher"

// Aggregates the load state of platform resources into the single
// dataError / refreshData surface the old context exposed. When `keys` is
// provided, only those resource endpoints are monitored — reducing unnecessary
// fetches for roles that don't need every resource. Consumed by
// <DataErrorBanner />.
export function useDataError(keys?: readonly string[]) {
  const { currentUser } = useAuth()
  const { mutate } = useSWRConfig()
  const enabled = Boolean(currentUser)

  const monitoredSet = useMemo(() => new Set(keys ?? RESOURCE_KEYS), [keys])

  // Fixed 10 hook calls — always invoked in the same order to satisfy
  // react-hooks/rules-of-hooks. Resources not in `monitoredSet` pass null
  // as the SWR key, which skips the fetch.
  const r0 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[0]) ? RESOURCE_KEYS[0] : null,
    jsonFetcher,
    swrOptions,
  )
  const r1 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[1]) ? RESOURCE_KEYS[1] : null,
    jsonFetcher,
    swrOptions,
  )
  const r2 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[2]) ? RESOURCE_KEYS[2] : null,
    jsonFetcher,
    swrOptions,
  )
  const r3 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[3]) ? RESOURCE_KEYS[3] : null,
    jsonFetcher,
    swrOptions,
  )
  const r4 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[4]) ? RESOURCE_KEYS[4] : null,
    jsonFetcher,
    swrOptions,
  )
  const r5 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[5]) ? RESOURCE_KEYS[5] : null,
    jsonFetcher,
    swrOptions,
  )
  const r6 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[6]) ? RESOURCE_KEYS[6] : null,
    jsonFetcher,
    swrOptions,
  )
  const r7 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[7]) ? RESOURCE_KEYS[7] : null,
    jsonFetcher,
    swrOptions,
  )
  const r8 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[8]) ? RESOURCE_KEYS[8] : null,
    jsonFetcher,
    swrOptions,
  )
  const r9 = useSWR(
    enabled && monitoredSet.has(RESOURCE_KEYS[9]) ? RESOURCE_KEYS[9] : null,
    jsonFetcher,
    swrOptions,
  )
  const results = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9]

  const hasError = results.some((r) => r.error)
  const dataError = hasError
    ? "One or more platform resources failed to load."
    : null

  const refreshData = useCallback(() => {
    for (const key of monitoredSet) void mutate(key)
  }, [mutate, monitoredSet])

  return { dataError, refreshData }
}
