"use client"

import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { MerchantOrderSummary } from "@/lib/types"

const KEY = "/api/orders/summary"

/**
 * Headline figures for the merchant overview, aggregated server-side over the
 * Merchant's whole account.
 *
 * Deliberately separate from `useOrders()`: that hook returns a single page of
 * rows, and deriving money totals from it is exactly the bug this replaces —
 * a merchant with 400 delivered orders was shown the earnings of their newest
 * 20, with no total on screen to reveal the truncation.
 */
export function useOrderSummary() {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<MerchantOrderSummary>(KEY, jsonFetcher, swrOptions)

  return {
    summary: data ?? null,
    isLoading,
    isRefreshing: isValidating,
    error,
    refresh: mutate,
  }
}
