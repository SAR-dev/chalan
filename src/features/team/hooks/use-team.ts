"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Role, TeamMember } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/team"
const _WAREHOUSES_KEY = "/api/warehouses"

interface NewAccountInput {
  name: string
  email: string
  phone: string
  role: Extract<Role, "WAREHOUSE_ADMIN">
  warehouseId?: string | null
}

// Team (staff accounts) resource. Creating/reassigning a Warehouse Admin also
// updates the warehouses cache's managedBy field, so both views stay
// consistent without a global reload — mirrors the old context exactly.
export function useTeam({
  initialData,
  initialTotal,
}: {
  initialData?: TeamMember[]
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
    mutate,
  } = useSWR<PaginatedResponse<TeamMember>>(
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

  const team = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  const createAccount = useCallback(
    async (input: NewAccountInput & { password: string }) => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to create account."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith(_WAREHOUSES_KEY))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )
  const toggleAccountActive = useCallback(
    async (id: string) => {
      const res = await fetch(`${KEY}/${id}/active`, { method: "PATCH" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to toggle account status."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const togglePricingPermission = useCallback(
    async (id: string) => {
      const res = await fetch(`${KEY}/${id}/pricing`, { method: "PATCH" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to toggle pricing permission."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith(_WAREHOUSES_KEY))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )
  const updateAccountWarehouse = useCallback(
    async (id: string, warehouseId: string | null) => {
      const res = await fetch(`${KEY}/${id}/warehouse`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to update warehouse assignment."),
        }
      }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith(_WAREHOUSES_KEY))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  return {
    team,
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
    isLoading,
    error,
    mutate,
    createAccount,
    toggleAccountActive,
    togglePricingPermission,
    updateAccountWarehouse,
  }
}
