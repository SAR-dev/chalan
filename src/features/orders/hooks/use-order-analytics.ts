"use client"

import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { OrderAnalytics } from "@/lib/types"

const KEY = "/api/orders/analytics"

export function useOrderAnalytics(params?: {
  merchantId?: string
  warehouseId?: string
  from?: string
  to?: string
}) {
  const url = new URL(KEY, window.location.origin)
  if (params?.merchantId) url.searchParams.set("merchantId", params.merchantId)
  if (params?.warehouseId) url.searchParams.set("warehouseId", params.warehouseId)
  if (params?.from) url.searchParams.set("from", params.from)
  if (params?.to) url.searchParams.set("to", params.to)

  const { data, error, isLoading } = useSWR<OrderAnalytics>(
    url.toString(),
    jsonFetcher,
    swrOptions,
  )

  return {
    analytics: data ?? null,
    isLoading,
    error,
  }
}
