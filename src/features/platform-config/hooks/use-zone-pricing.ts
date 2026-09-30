"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { ZonePricing } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/admin/zone-pricing"

type Result = { ok: boolean; error?: string }

export function useZonePricing() {
  const { currentUser } = useAuth()
  const isAdmin =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "WAREHOUSE_ADMIN"

  const {
    data: pricing,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<ZonePricing[]>(isAdmin ? KEY : null, jsonFetcher, swrOptions)

  const allPricing = pricing ?? []

  const upsertPricing = useCallback(
    async (input: {
      fromZoneId: string
      toZoneId: string
      baseRate: number
      extraRatePerKg: number
      freeWeightKg: number
      maxWeightKg: number
      codFeePercentage: number
      cancellationFee?: number
    }): Promise<Result> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not save pricing."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deletePricing = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const data = await res
        .json()
        .catch(() => null)
        .catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not delete pricing."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    pricing: allPricing,
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    upsertPricing,
    deletePricing,
  }
}
