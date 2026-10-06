"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { ZoneDeliveryTime } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/admin/zone-delivery-time"

type Result = { ok: boolean; error?: string }

/**
 * The zone-to-zone delivery-time matrix.
 *
 * Mirrors `useZonePricing` deliberately — same upsert-then-mutate shape, same
 * admin gate — so the two matrices can be edited the same way and a future
 * reader who knows one knows the other. The row shape differs only in having a
 * single number instead of six rates.
 */
export function useZoneDeliveryTime() {
  const { currentUser } = useAuth()
  const isAdmin =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "WAREHOUSE_ADMIN"

  const {
    data: rows,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<ZoneDeliveryTime[]>(isAdmin ? KEY : null, jsonFetcher, swrOptions)

  const upsertDeliveryTime = useCallback(
    async (input: {
      fromZoneId: string
      toZoneId: string
      deliveryDays: number
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
          error: formatError(data, "Could not save delivery time."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteDeliveryTime = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not delete delivery time."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    rows: rows ?? [],
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    upsertDeliveryTime,
    deleteDeliveryTime,
  }
}
