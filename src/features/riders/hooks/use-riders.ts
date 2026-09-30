"use client"

import { useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import { MAX_LIMIT } from "@/lib/pagination"
import type { Rider, RiderTaskType, RiderVehicleType } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/riders"

interface RiderUpdateInput {
  name?: string
  phone?: string
  zone?: string
  warehouseId?: string
  taskType?: RiderTaskType
  // Explicit null clears the vehicle, so the type has to carry null rather than
  // just `?: string` — that would make "unset" and "clear it" indistinguishable
  // and the PATCH would silently keep the old vehicle.
  vehicleType?: RiderVehicleType | null
  vehiclePlate?: string | null
  isActive?: boolean
}

export const canDeliver = (r: Rider) =>
  r.taskType === "DELIVERY" || r.taskType === "BOTH"

export const canPickup = (r: Rider) =>
  r.taskType === "PICKUP" || r.taskType === "BOTH"

export function useRiders({
  initialData,
  initialTotal,
}: {
  initialData?: Rider[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const filters = useTableFilters()
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined)
  const [taskType, setTaskType] = useState<string | undefined>(undefined)

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    isActive: isActive !== undefined ? String(isActive) : undefined,
    taskType,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const isDefaultQuery =
    !filters.debouncedQuery &&
    !filters.sortId &&
    filters.page === 1 &&
    isActive === undefined &&
    taskType === undefined

  const {
    data: response,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<PaginatedResponse<Rider>>(currentUser ? url : null, jsonFetcher, {
    ...swrOptions,
    ...(isDefaultQuery && initialData
      ? {
          fallbackData: {
            data: initialData,
            total: initialTotal ?? initialData.length,
            limit: filters.limit,
            offset: 0,
          },
        }
      : {}),
  })

  const riders = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Fetch current rider record when the logged-in user is a rider.
  const riderId = currentUser?.role === "RIDER" ? currentUser.riderId : null
  const { data: currentRiderResponse } = useSWR<Rider>(
    riderId ? `${KEY}/${riderId}` : null,
    jsonFetcher,
    swrOptions,
  )
  const currentRider = currentRiderResponse ?? null

  // Fetch warehouse-scoped riders when a warehouse is active.
  const warehouseId = currentWarehouse?.id
  // A warehouse's roster feeds the dispatch picker, so it must not be paged by
  // the server default — ask for the full (capped) set explicitly.
  const warehouseRidersKey =
    currentUser && warehouseId
      ? `${KEY}?warehouseId=${warehouseId}&limit=${MAX_LIMIT}`
      : null
  const { data: warehouseResponse } = useSWR<PaginatedResponse<Rider>>(
    warehouseRidersKey,
    jsonFetcher,
    swrOptions,
  )
  const warehouseRiders = warehouseResponse?.data ?? []

  const warehouseDeliveryRiders = warehouseRiders.filter(
    (r) => r.isActive && canDeliver(r),
  )

  const revalidateAll = useCallback(() => {
    mutate()
    globalMutate((key: string) => key.startsWith(KEY))
  }, [mutate])

  const updateRider = useCallback(
    async (id: string, input: RiderUpdateInput) => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to update rider."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const toggleRiderActive = useCallback(
    async (id: string) => {
      const res = await fetch(`${KEY}/${id}/active`, { method: "PATCH" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to toggle rider status."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  return {
    riders,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    isActive,
    setIsActive,
    taskType,
    setTaskType,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    currentRider,
    warehouseRiders,
    warehouseDeliveryRiders,
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    updateRider,
    toggleRiderActive,
  }
}
