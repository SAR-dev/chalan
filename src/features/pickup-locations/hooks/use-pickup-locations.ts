"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { PickupLocation } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/pickup-locations"

interface PickupLocationInput {
  label: string
  address: string
  cityId: string
  mapLink?: string
}

type Result = { ok: boolean; error?: string }

export function usePickupLocations() {
  const { currentUser } = useAuth()
  const filters = useTableFilters()
  const { mutate: globalMutate } = useSWRConfig()

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
  })

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<PickupLocation>>(
    currentUser ? url : null,
    jsonFetcher,
    swrOptions,
  )

  const pickupLocations = response?.data ?? []
  const total = response?.total ?? 0

  const revalidateAll = useCallback(() => {
    return globalMutate((key) => typeof key === "string" && key.startsWith(KEY))
  }, [globalMutate])

  const createPickupLocation = useCallback(
    async (input: PickupLocationInput): Promise<Result> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not add the pickup location."),
        }
      }
      await revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const updatePickupLocation = useCallback(
    async (id: string, input: PickupLocationInput): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not update the pickup location."),
        }
      }
      await revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const deletePickupLocation = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not remove the pickup location."),
        }
      }
      await revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  return {
    pickupLocations,
    total,
    isLoading,
    error,
    mutate,
    createPickupLocation,
    updatePickupLocation,
    deletePickupLocation,
    query: filters.query,
    setQuery: filters.setQuery,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
  }
}
