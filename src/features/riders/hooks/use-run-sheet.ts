"use client"

import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

export interface RunStop {
  orderId: string
  sequence: number
  zoneId: string | null
  zoneName: string | null
  cityName: string | null
}

export interface RunSheet {
  riderId: string
  riderName: string
  stops: RunStop[]
  zoneHops: number
  zoneCount: number
}

/**
 * The rider's suggested drop order. Keyed on the rider id, so it never fires
 * for a rider page with no rider attached yet.
 */
export function useRunSheet(riderId?: string | null) {
  const key = riderId ? `/api/riders/${riderId}/run-sheet` : null
  const { data, error, isLoading, mutate } = useSWR<RunSheet>(
    key,
    jsonFetcher,
    swrOptions,
  )

  // Stops are already sequenced by the server in the order they should be
  // driven, so consumers must not re-sort them — that would undo the batching.
  const runs = data?.stops ?? []

  return {
    runSheet: data ?? null,
    stops: runs,
    zoneHops: data?.zoneHops ?? 0,
    zoneCount: data?.zoneCount ?? 0,
    isLoading: Boolean(key) && isLoading,
    isError: Boolean(error),
    refresh: mutate,
  }
}
