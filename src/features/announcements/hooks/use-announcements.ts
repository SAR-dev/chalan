"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Announcement } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/announcements"

type Result = { ok: boolean; error?: string }

export interface AnnouncementInput {
  title: string
  content: string
  publishedAt?: string | null
  expiresAt?: string | null
  isActive?: boolean
  targetRoles: string[]
}

export function useAnnouncements() {
  const { currentUser } = useAuth()
  const filters = useTableFilters()

  const [isActive, setIsActive] = useState<boolean | undefined>(undefined)

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
    active: isActive !== undefined ? String(isActive) : undefined,
  })

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<Announcement>>(
    currentUser ? url : null,
    jsonFetcher,
    swrOptions,
  )

  const announcements = response?.data ?? []
  const total = response?.total ?? 0

  const createAnnouncement = useCallback(
    async (input: AnnouncementInput): Promise<Result> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not create the announcement."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const updateAnnouncement = useCallback(
    async (id: string, input: Partial<AnnouncementInput>): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not update the announcement."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteAnnouncement = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not delete the announcement."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteAnnouncements = useCallback(
    async (ids: string[]): Promise<Result> => {
      const res = await fetch(`${KEY}/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not delete announcements."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    announcements,
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
    isActive,
    setIsActive,
    isLoading,
    error,
    mutate,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    deleteAnnouncements,
  }
}
