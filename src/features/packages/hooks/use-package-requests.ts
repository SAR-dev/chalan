"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { PackagePurchaseStatus } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/admin/package-requests"

type Result = { ok: boolean; error?: string }

export interface PackageRequestRow {
  id: string
  merchantId: string
  merchantName: string
  packageId: string
  packageName: string
  amount: number
  status: PackagePurchaseStatus
  note: string | null
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectReason: string | null
}

export function usePackageRequests() {
  const { currentUser } = useAuth()

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    PackageRequestRow[]
  >(currentUser ? KEY : null, jsonFetcher, swrOptions)

  const review = useCallback(
    async (
      id: string,
      action: "approve" | "reject",
      reason?: string,
    ): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject" ? { action, reason } : { action },
        ),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not review the request."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const approve = useCallback((id: string) => review(id, "approve"), [review])

  const reject = useCallback(
    (id: string, reason: string) => review(id, "reject", reason),
    [review],
  )

  return {
    requests: data ?? [],
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    approve,
    reject,
  }
}
