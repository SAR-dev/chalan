"use client"

import { useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { EmailLog } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/email-logs"

type Result = { ok: true } | { ok: false; error?: string }

export function useEmailLogs() {
  const { currentUser } = useAuth()
  const filters = useTableFilters()

  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
    status: statusFilter,
  })

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<EmailLog>>(
    currentUser ? url : null,
    jsonFetcher,
    swrOptions,
  )

  const markAsSent = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, { method: "PATCH" })
      const resData = await res.json()
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Failed to mark as sent."),
        }
      await mutate()
      await globalMutate((key: string) => key.startsWith(KEY))
      return { ok: true }
    },
    [mutate],
  )

  const markAsSentBulk = useCallback(
    async (ids: string[]): Promise<Result> => {
      const res = await fetch(`${KEY}/bulk/mark-sent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not mark emails as sent."),
        }
      }
      await mutate()
      await globalMutate((key: string) => key.startsWith(KEY))
      return { ok: true }
    },
    [mutate],
  )

  return {
    emailLogs: response?.data ?? [],
    total: response?.total ?? 0,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    statusFilter,
    setStatusFilter,
    isLoading,
    error,
    mutate,
    markAsSent,
    markAsSentBulk,
  }
}
