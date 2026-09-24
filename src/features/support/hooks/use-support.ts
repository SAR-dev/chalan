"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { SupportTicket } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/support"

type Result = { ok: boolean; error?: string }

export interface SupportCreateInput {
  subject: string
  message: string
}

export interface SupportReplyInput {
  adminReply?: string
  status?: "CLOSED"
}

export function useSupport({
  initialData,
  initialTotal,
}: {
  initialData?: SupportTicket[]
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
  } = useSWR<PaginatedResponse<SupportTicket>>(
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

  const tickets = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  const createTicket = useCallback(
    async (
      input: SupportCreateInput,
    ): Promise<Result & { ticket?: SupportTicket }> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not submit your ticket."),
        }
      }
      await mutate()
      return { ok: true, ticket: data }
    },
    [mutate],
  )

  const replyTicket = useCallback(
    async (id: string, input: SupportReplyInput): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not update this ticket."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const closeTicket = useCallback(
    async (id: string): Promise<Result> =>
      replyTicket(id, { status: "CLOSED" }),
    [replyTicket],
  )

  return {
    tickets,
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
    createTicket,
    replyTicket,
    closeTicket,
  }
}
