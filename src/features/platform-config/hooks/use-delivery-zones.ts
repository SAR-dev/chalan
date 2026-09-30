"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { DeliveryZone } from "@/lib/types"
import { formatError } from "@/lib/validation"

const ADMIN_KEY = "/api/admin/delivery-zones"
const PUBLIC_KEY = "/api/delivery-zones"

type Result = { ok: boolean; error?: string }

export function useDeliveryZones() {
  const { currentUser } = useAuth()
  const isAdmin =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "WAREHOUSE_ADMIN"

  const {
    data: zones,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<DeliveryZone[]>(
    isAdmin ? ADMIN_KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const { data: publicZones, isLoading: isPublicLoading } = useSWR<
    DeliveryZone[]
  >(!isAdmin ? PUBLIC_KEY : null, jsonFetcher, swrOptions)

  const activeZones = (isAdmin ? zones : publicZones) ?? []

  const createZone = useCallback(
    async (name: string): Promise<Result> => {
      const res = await fetch(ADMIN_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return { ok: false, error: formatError(data, "Could not create zone.") }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const updateZone = useCallback(
    async (
      id: string,
      data: { name?: string; isActive?: boolean },
    ): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const resData = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Could not update zone."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteZone = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}`, { method: "DELETE" })
      const data = await res
        .json()
        .catch(() => null)
        .catch(() => null)
      if (!res.ok)
        return { ok: false, error: formatError(data, "Could not delete zone.") }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    zones: activeZones,
    isLoading: isAdmin ? isLoading : isPublicLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    createZone,
    updateZone,
    deleteZone,
  }
}
