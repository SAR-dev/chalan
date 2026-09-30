"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { BalanceTransaction } from "@/lib/types"
import { formatError } from "@/lib/validation"

type BalanceResponse = {
  balance: number
  pendingBalance: number
  data: BalanceTransaction[]
  total: number
}

type Result = { ok: boolean; error?: string; data?: BalanceTransaction }

export interface UseMerchantBalanceOptions {
  /**
   * `"payments"` narrows the feed to top-up rows (pending / confirmed /
   * rejected) for the Wallet tab. Filtered server-side so the pagination and
   * total stay correct.
   */
  kind?: "all" | "payments"
}

export function useMerchantBalance(
  merchantId: string | null,
  options: UseMerchantBalanceOptions = {},
) {
  const { kind = "all" } = options
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_TABLE_ROWS_PER_PAGE)
  const [sortId, setSortId] = useState("")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const base = merchantId ? `/api/merchants/${merchantId}/balance` : null

  const buildUrl = () => {
    if (!base) return null
    const sp = new URLSearchParams()
    sp.set("limit", String(limit))
    sp.set("offset", String((page - 1) * limit))
    if (kind === "payments") sp.set("kind", "payments")
    if (sortId) {
      sp.set("sort", sortId)
      sp.set("sortDir", sortDir)
    }
    return `${base}?${sp}`
  }

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<BalanceResponse>(buildUrl(), jsonFetcher, swrOptions)

  const balance = data?.balance ?? 0
  // Authoritative: maintained by the payment submit/confirm/reject routes.
  const pendingBalance = data?.pendingBalance ?? 0
  const transactions = data?.data ?? []
  const total = data?.total ?? 0

  const hasPendingPayment = pendingBalance > 0

  const submitPayment = useCallback(
    async (input: {
      amount: number
      paymentMethod: string
      paymentAccount: string
      note?: string
    }): Promise<Result> => {
      const res = await fetch(`/api/merchants/${merchantId}/balance/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const resData = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Failed to submit payment."),
        }
      await mutate()
      return { ok: true, data: resData }
    },
    [merchantId, mutate],
  )

  const confirmPayment = useCallback(
    async (txId: string): Promise<Result> => {
      const res = await fetch(
        `/api/merchants/${merchantId}/balance/payment/${txId}/confirm`,
        { method: "PATCH" },
      )
      const resData = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Failed to confirm payment."),
        }
      await mutate()
      return { ok: true, data: resData }
    },
    [merchantId, mutate],
  )

  const rejectPayment = useCallback(
    async (txId: string, reason: string): Promise<Result> => {
      const res = await fetch(
        `/api/merchants/${merchantId}/balance/payment/${txId}/reject`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      )
      const resData = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Failed to reject payment."),
        }
      await mutate()
      return { ok: true, data: resData }
    },
    [merchantId, mutate],
  )

  const adjustBalance = useCallback(
    async (amount: number, note: string): Promise<Result> => {
      const res = await fetch(`/api/merchants/${merchantId}/balance/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      })
      const resData = await res.json().catch(() => null)
      if (!res.ok)
        return {
          ok: false,
          error: formatError(resData, "Failed to adjust balance."),
        }
      await mutate()
      return { ok: true, data: resData }
    },
    [merchantId, mutate],
  )

  const onSortChange = useCallback(
    (newSortId: string, newSortDir: "asc" | "desc") => {
      setSortId(newSortId)
      setSortDir(newSortDir)
      setPage(1)
    },
    [],
  )

  return {
    balance,
    pendingBalance,
    transactions,
    total,
    hasPendingPayment,
    isLoading,
    isValidating,
    error,
    page,
    setPage,
    limit,
    setLimit,
    sortId,
    sortDir,
    onSortChange,
    submitPayment,
    confirmPayment,
    rejectPayment,
    adjustBalance,
    mutate,
  }
}
