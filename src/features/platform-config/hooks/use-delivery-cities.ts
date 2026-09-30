"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { DeliveryCity } from "@/lib/types"
import { formatError } from "@/lib/validation"

const ADMIN_KEY = "/api/admin/delivery-cities"
const PUBLIC_KEY = "/api/delivery-cities"

export type DeliveryCityOption = DeliveryCity & {
  warehouseName?: string | null
}

type Result = { ok: boolean; error?: string }

export function useDeliveryCities() {
  const { currentUser } = useAuth()
  const isAdmin =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "WAREHOUSE_ADMIN"

  const {
    data: cities,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<DeliveryCityOption[]>(
    isAdmin ? ADMIN_KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const { data: publicCities, isLoading: isPublicLoading } = useSWR<
    DeliveryCityOption[]
  >(!isAdmin ? PUBLIC_KEY : null, jsonFetcher, swrOptions)

  const activeCities: DeliveryCityOption[] =
    (isAdmin ? cities : publicCities) ?? []

  const createCity = useCallback(
    async (input: {
      name: string
      zoneId: string
      warehouseId: string
    }): Promise<Result> => {
      const res = await fetch(ADMIN_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not create city."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const toggleCity = useCallback(
    async (id: string, isActive: boolean): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not update city."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteCity = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}`, { method: "DELETE" })
      const data = await res
        .json()
        .catch(() => null)
        .catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not delete city."),
        }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    cities: activeCities,
    isLoading: isAdmin ? isLoading : isPublicLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    createCity,
    toggleCity,
    deleteCity,
  }
}
