"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Warehouse } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/warehouses"

const _byName = (a: Warehouse, b: Warehouse) => a.name.localeCompare(b.name)

// Warehouses resource. Create/update/delete keep the cache sorted by name to
// match the old context, and expose the current Warehouse Admin's hub.
export function useWarehouses({
  initialData,
  initialTotal,
}: {
  initialData?: Warehouse[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const { mutate: _globalMutate } = useSWRConfig()
  const filters = useTableFilters()

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const isDefaultQuery =
    !filters.debouncedQuery && !filters.sortId && filters.page === 1

  const {
    data: response,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<PaginatedResponse<Warehouse>>(
    currentUser ? url : null,
    jsonFetcher,
    {
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
    },
  )

  const warehouses = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Fetch the current warehouse record for Warehouse Admin users.
  const warehouseId =
    currentUser?.role === "WAREHOUSE_ADMIN" ? currentUser.warehouseId : null
  const { data: currentWarehouseData } = useSWR<Warehouse>(
    warehouseId ? `${KEY}/${warehouseId}` : null,
    jsonFetcher,
    swrOptions,
  )
  const currentWarehouse = currentWarehouseData ?? null

  const createWarehouse = useCallback(
    async (input: {
      name: string
      address: string
      city: string
    }): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not create the warehouse."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const updateWarehouse = useCallback(
    async (
      id: string,
      input: {
        name?: string
        address?: string
        city?: string
        isActive?: boolean
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not update the warehouse."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const deleteWarehouse = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not delete the warehouse."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  return {
    warehouses,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    currentWarehouse,
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
  }
}
