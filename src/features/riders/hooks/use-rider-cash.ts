"use client"

import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

const KEY = "/api/riders/cash"

export interface RiderCashRecord {
  riderId: string
  riderName: string
  cashOnHand: number
  totalCollected: number
  totalSubmitted: number
}

/**
 * Per-rider cash holdings for the warehouse cash page.
 *
 * SWR rather than `useState` + `useEffect` + bare `fetch`, for the same reason
 * the mail-config table moved off that shape. Component state is destroyed on
 * every remount, and the page gated its whole table on a local `loading` flag,
 * so any remount (a router transition, a re-render that re-creates the element,
 * React remounting after a suspended boundary) replaced rows the server still
 * had with a full-page spinner. SWR's cache sits above the component, so a
 * remount reads the last response back synchronously and the rows never leave.
 *
 * `jsonFetcher` also sends `cache: "no-store"`, so a revalidation always reaches
 * the server instead of being answered from the browser cache.
 *
 * `isRefreshing` is `isValidating`, not `isLoading`. SWR reports `isLoading`
 * only for the first load and goes quiet during a revalidation, so a page that
 * reads `isLoading` alone cannot distinguish "still fetching" from "settled".
 */
export function useRiderCash() {
  const { currentUser } = useAuth()

  // The route answers MERCHANT with an empty array and rejects RIDER outright,
  // so neither role has a request worth making. A null key skips the fetch
  // entirely rather than firing a request guaranteed to be refused or ignored.
  const canView =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "WAREHOUSE_ADMIN"

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    RiderCashRecord[]
  >(canView ? KEY : null, jsonFetcher, swrOptions)

  return {
    riderCash: data ?? [],
    isLoading,
    isRefreshing: isValidating,
    error,
    refresh: mutate,
  }
}
