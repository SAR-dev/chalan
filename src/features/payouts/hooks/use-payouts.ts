"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { PayoutRequest } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/payouts"

type Result = { ok: boolean; error?: string }

// Payout requests resource. Spans two caches: a merchant requesting a payout
// (or an admin rejecting one) also locks/unlocks the affected orders, so those
// mutations revalidate the orders cache too via the shared SWR config.
export function usePayouts({
  initialData,
  initialTotal,
}: {
  initialData?: PayoutRequest[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const { currentMerchant } = useMerchants()
  const { mutate: _globalMutate } = useSWRConfig()
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
  } = useSWR<PaginatedResponse<PayoutRequest>>(
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

  const payoutRequests = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Unfiltered list for stat card counts — fetches all statuses regardless
  // of the current tab filter.
  const allUrl = buildTableUrl(KEY, {
    limit: 9999,
    offset: 0,
    q: filters.debouncedQuery || undefined,
    statuses: undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const { data: allResponse } = useSWR<PaginatedResponse<PayoutRequest>>(
    currentUser ? allUrl : null,
    jsonFetcher,
    swrOptions,
  )

  const allPayoutRequests = allResponse?.data ?? []

  // Fetch all payout requests for the current merchant (server-side filtered
  // for MERCHANT role, or via merchantId param for ADMIN/SUPER_ADMIN lookups).
  const merchantId = currentMerchant?.id
  const merchantPayoutsKey =
    currentUser && merchantId
      ? currentUser.role === "MERCHANT"
        ? KEY
        : `${KEY}?merchantId=${merchantId}`
      : null
  const { data: merchantResponse } = useSWR<PaginatedResponse<PayoutRequest>>(
    merchantPayoutsKey,
    jsonFetcher,
    swrOptions,
  )
  const merchantPayoutRequests = merchantResponse?.data ?? []

  const requestPayout = useCallback(
    async (input: {
      payoutMethod: string
      payoutDetails: string
    }): Promise<{ ok: boolean; request?: PayoutRequest; error?: string }> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const resData = await res.json()
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Could not request payout."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith("/api/orders"))
      return { ok: true, request: resData }
    },
    [mutate, _globalMutate],
  )

  const approvePayout = useCallback(
    async (requestId: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${requestId}/approve`, {
        method: "PATCH",
      })
      const resData = await res.json()
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Could not approve payout."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith("/api/orders"))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const approvePayouts = useCallback(
    async (ids: string[]): Promise<Result> => {
      const res = await fetch(`${KEY}/bulk/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not approve payouts."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith("/api/orders"))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const rejectPayout = useCallback(
    async (requestId: string, reason: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${requestId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      })
      const resData = await res.json()
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Could not reject payout."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith("/api/orders"))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const rejectPayouts = useCallback(
    async (ids: string[], reason = "Bulk reject"): Promise<Result> => {
      const res = await fetch(`${KEY}/bulk/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not reject payouts."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      _globalMutate((key: string) => key.startsWith("/api/orders"))
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const markPayoutPaid = useCallback(
    async (requestId: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${requestId}/paid`, { method: "PATCH" })
      const resData = await res.json()
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Could not mark payout as paid."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  const markPayoutsPaid = useCallback(
    async (ids: string[]): Promise<Result> => {
      const res = await fetch(`${KEY}/bulk/mark-paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(data, "Could not mark payouts as paid."),
        }
      await mutate()
      _globalMutate((key: string) => key === KEY)
      return { ok: true }
    },
    [mutate, _globalMutate],
  )

  return {
    payoutRequests,
    allPayoutRequests,
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
    merchantPayoutRequests,
    isLoading,
    error,
    mutate,
    requestPayout,
    approvePayout,
    approvePayouts,
    rejectPayout,
    rejectPayouts,
    markPayoutPaid,
    markPayoutsPaid,
  }
}
