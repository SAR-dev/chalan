"use client"

import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { AuditLog } from "@/lib/types"

const KEY = "/api/audit-logs"

export function useAuditLogs({
  initialData,
  initialTotal,
}: {
  initialData?: AuditLog[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
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
  } = useSWR<PaginatedResponse<AuditLog>>(
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

  return {
    auditLogs: response?.data ?? initialData ?? [],
    total: response?.total ?? initialTotal ?? 0,
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
  }
}
