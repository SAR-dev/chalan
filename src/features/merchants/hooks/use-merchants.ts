"use client"

import { useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { Merchant, MerchantPricingInput } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/merchants"

export function useMerchants({
  initialData,
  initialTotal,
}: {
  initialData?: Merchant[]
  initialTotal?: number
} = {}) {
  const { currentUser } = useAuth()
  const filters = useTableFilters()
  const [nidStatus, setNidStatus] = useState<string | undefined>(undefined)
  const [emailVerified, setEmailVerified] = useState<string | undefined>(
    undefined,
  )

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    statuses: filters.statuses,
    nidStatus,
    emailVerified,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const isDefaultQuery =
    !filters.debouncedQuery &&
    !filters.statuses &&
    !filters.sortId &&
    !nidStatus &&
    !emailVerified &&
    filters.page === 1

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<Merchant>>(
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

  const merchants = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Unfiltered list for stat card counts — fetches all statuses regardless
  // of the current tab filter.
  const allUrl = buildTableUrl(KEY, {
    limit: 9999,
    offset: 0,
    q: filters.debouncedQuery || undefined,
    statuses: undefined,
    nidStatus: undefined,
    emailVerified: undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
  })

  const { data: allResponse } = useSWR<PaginatedResponse<Merchant>>(
    currentUser ? allUrl : null,
    jsonFetcher,
    swrOptions,
  )

  const allMerchants = allResponse?.data ?? []

  // Fetch the current merchant's own record when logged in as MERCHANT.
  const merchantId =
    currentUser?.role === "MERCHANT" ? currentUser.merchantId : null
  const { data: currentMerchantData, isLoading: isCurrentMerchantLoading } =
    useSWR<Merchant>(
      merchantId ? `${KEY}/${merchantId}` : null,
      jsonFetcher,
      swrOptions,
    )
  const currentMerchant = currentMerchantData ?? null

  const revalidateAll = useCallback(() => {
    mutate()
    globalMutate((key: string) => key.startsWith(KEY))
  }, [mutate])

  const _replaceOne = useCallback(
    (_id: string, _updated: Merchant) => {
      revalidateAll()
    },
    [revalidateAll],
  )

  const suspendMerchant = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/merchants/${id}/suspend`, {
        method: "PATCH",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to suspend merchant."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const suspendMerchants = useCallback(
    async (ids: string[]) => {
      const res = await fetch(`/api/merchants/bulk/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to suspend merchants."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const reactivateMerchant = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/merchants/${id}/reactivate`, {
        method: "PATCH",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to reactivate merchant."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const reactivateMerchants = useCallback(
    async (ids: string[]) => {
      const res = await fetch(`/api/merchants/bulk/reactivate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to reactivate merchants."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const setMerchantPricing = useCallback(
    async (id: string, pricing: MerchantPricingInput) => {
      const res = await fetch(`/api/merchants/${id}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricing),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(data, "Failed to update pricing."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  const updateMerchantProfile = useCallback(
    async (
      id: string,
      input: {
        businessName: string
        email: string
        phone: string
        address: string
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`/api/merchants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(data, "Could not update your business details."),
        }
      }
      revalidateAll()
      return { ok: true }
    },
    [revalidateAll],
  )

  return {
    merchants,
    allMerchants,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    statuses: filters.statuses,
    setStatuses: filters.setStatuses,
    nidStatus,
    setNidStatus,
    emailVerified,
    setEmailVerified,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    currentMerchant,
    isCurrentMerchantLoading,
    isLoading,
    error,
    mutate,
    suspendMerchant,
    suspendMerchants,
    reactivateMerchant,
    reactivateMerchants,
    setMerchantPricing,
    updateMerchantProfile,
  }
}
