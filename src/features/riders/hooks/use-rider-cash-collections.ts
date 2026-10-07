"use client"

import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

const KEY = "/api/riders"

export interface CashSummary {
  cashOnHand: number
  totalCollected: number
  totalSubmitted: number
}

export interface CashTransaction {
  id: string
  riderId: string
  orderId: string
  /**
   * `SUBMITTED` is declared by the API contract but not currently emitted —
   * `/api/riders/[id]/cash` derives entries from `delivered` (COLLECTED) and
   * from `codSettledAt` (CONFIRMED). Kept in the union so the page keeps
   * rendering it sanely if the endpoint starts producing it.
   */
  type: "COLLECTED" | "SUBMITTED" | "CONFIRMED"
  amount: number
  createdAt: string
  confirmedBy: string | null
  confirmedAt: string | null
}

export interface RiderCashCollections {
  cash: CashSummary
  transactions: CashTransaction[]
}

/**
 * The rider's cash summary and transaction list for `/rider/cash`.
 *
 * SWR rather than `useState` + `useEffect` + bare `fetch`, which is what this
 * page used. That shape gated an *early return* on local `loading`, so any
 * remount tore down the whole view — header, three summary cards, and activity
 * list — and replaced it with a spinner for data the server still had. It is the
 * same drift the mail-config table and the warehouse rider-cash panel had.
 *
 * SWR's cache sits above the component, so a remount reads the last response
 * back synchronously and nothing leaves the screen.
 *
 * `isRefreshing` is `isValidating`: SWR reports `isLoading` only for the first
 * load and goes quiet during a revalidation, so a consumer reading `isLoading`
 * alone cannot tell "still fetching" from "settled".
 */
export function useRiderCashCollections() {
  const { currentUser } = useAuth()
  const riderId = currentUser?.riderId ?? null

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<RiderCashCollections>(
      riderId ? `${KEY}/${riderId}/cash` : null,
      jsonFetcher,
      swrOptions,
    )

  return {
    riderId,
    cash: data?.cash ?? null,
    transactions: data?.transactions ?? [],
    isLoading,
    isRefreshing: isValidating,
    error,
    refresh: mutate,
  }
}
