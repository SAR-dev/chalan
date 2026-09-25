"use client"

import { useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Role } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/admin/users"

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role | null
  isActive: boolean | null
  banned: boolean | null
  banReason: string | null
  banExpires: string | null
  emailVerified: boolean
  createdAt: string
}

type MutationResult = { ok: boolean; error?: string }

export function useUsers({
  initialData,
  initialTotal,
}: {
  initialData?: AdminUser[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const filters = useTableFilters()
  const [role, setRole] = useState<string | undefined>(undefined)

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    role,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const isDefaultQuery =
    !filters.debouncedQuery && !role && !filters.sortId && filters.page === 1

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<AdminUser>>(
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

  const users = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  const revalidate = useCallback(() => {
    mutate()
    globalMutate(
      (key: string) => typeof key === "string" && key.startsWith(KEY),
    )
  }, [mutate])

  const resetPassword = useCallback(
    async (id: string, password: string): Promise<MutationResult> => {
      const res = await fetch(`${KEY}/${id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Failed to reset the password."),
        }
      }
      revalidate()
      return { ok: true }
    },
    [revalidate],
  )

  const banUser = useCallback(
    async (
      id: string,
      input: { reason: string; expiresInDays?: number },
    ): Promise<MutationResult> => {
      const res = await fetch(`${KEY}/${id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Failed to ban the user."),
        }
      }
      revalidate()
      return { ok: true }
    },
    [revalidate],
  )

  const unbanUser = useCallback(
    async (id: string): Promise<MutationResult> => {
      const res = await fetch(`${KEY}/${id}/unban`, { method: "PATCH" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Failed to unban the user."),
        }
      }
      revalidate()
      return { ok: true }
    },
    [revalidate],
  )

  return {
    users,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    role,
    setRole,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    isLoading,
    error,
    currentUserId: currentUser?.id ?? null,
    resetPassword,
    banUser,
    unbanUser,
  }
}
