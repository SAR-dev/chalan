"use client"

import { useCallback } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Rider } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/rider-applications"

export interface RiderApplication extends Rider {
  warehouseName?: string | null
}

export function useRiderApplications({
  initialData,
  initialTotal,
}: {
  initialData?: RiderApplication[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const filters = useTableFilters()

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    statuses: filters.statuses,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const isDefaultQuery =
    !filters.debouncedQuery &&
    !filters.statuses &&
    !filters.sortId &&
    filters.page === 1

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<RiderApplication>>(
    currentUser && currentUser.role === "SUPER_ADMIN" ? url : null,
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

  const applications = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Separate unfiltered list for stat card counts — always fetches all
  // statuses regardless of the current tab filter.
  const allUrl = buildTableUrl(KEY, {
    limit: 9999,
    offset: 0,
    q: filters.debouncedQuery || undefined,
    statuses: undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const { data: allResponse } = useSWR<PaginatedResponse<RiderApplication>>(
    currentUser && currentUser.role === "SUPER_ADMIN" ? allUrl : null,
    jsonFetcher,
    swrOptions,
  )

  const allApplications = allResponse?.data ?? []

  const revalidateAll = useCallback(() => {
    mutate()
    globalMutate((key: string) => key.startsWith(KEY))
  }, [mutate])

  const approveApplication = useCallback(
    async (id: string) => {
      const res = await fetch(`${KEY}/${id}/approve`, { method: "PATCH" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to approve application."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const rejectApplication = useCallback(
    async (id: string, reason: string) => {
      const res = await fetch(`${KEY}/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to reject application."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  return {
    applications,
    allApplications,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    statuses: filters.statuses,
    setStatuses: filters.setStatuses,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    isLoading,
    error,
    mutate,
    approveApplication,
    rejectApplication,
  }
}
