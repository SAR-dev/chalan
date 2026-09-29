"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { PackageRuleType } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/packages"

type Result = { ok: boolean; error?: string }

export interface PackageTier {
  id: string
  packageId: string
  orderCount: number
  sortOrder: number
  ruleType: PackageRuleType
  ruleValue: number
}

export interface PackageRow {
  id: string
  name: string
  description: string | null
  price: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  tiers: PackageTier[]
}

export interface MerchantPackage {
  id: string
  merchantId: string
  packageId: string
  ordersUsed: number
  isActive: boolean
  startedAt: string
  endedAt: string | null
}

export interface PackagePurchaseRequest {
  id: string
  packageId: string
  amount: number
  status: "PENDING" | "APPROVED" | "REJECTED"
  note: string | null
  rejectReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  requestedAt: string
}

export interface PackagesResponse {
  packages: PackageRow[]
  activePackage: MerchantPackage | null
  latestRequest: PackagePurchaseRequest | null
}

export interface PackageInput {
  name: string
  description?: string | null
  price: number
  isActive?: boolean
}

export interface PackageTierInput {
  orderCount: number
  ruleType: PackageRuleType
  ruleValue: number
  sortOrder?: number
}

/**
 * Package catalogue. The same hook serves the admin catalogue (all packages,
 * CRUD mutations) and the merchant catalogue (active packages + this merchant's
 * bundle and open request, plus the request mutation).
 */
export function usePackages() {
  const { currentUser } = useAuth()

  const { data, error, isLoading, mutate } = useSWR<PackagesResponse>(
    currentUser ? KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const createPackage = useCallback(
    async (input: PackageInput): Promise<Result> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not create the package."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const updatePackage = useCallback(
    async (id: string, input: Partial<PackageInput>): Promise<Result> => {
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not update the package."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  /**
   * Removes a package. Returns `archived: true` when it was still referenced
   * by a bundle or purchase request and could only be hidden from the
   * catalogue — the caller should tell the admin the difference.
   */
  const deletePackage = useCallback(
    async (id: string): Promise<Result & { archived?: boolean }> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not delete the package."),
        }
      }
      await mutate()
      return { ok: true, archived: body?.archived === true }
    },
    [mutate],
  )

  const addTier = useCallback(
    async (packageId: string, input: PackageTierInput): Promise<Result> => {
      const res = await fetch(`${KEY}/${packageId}/tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not add the tier."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const updateTier = useCallback(
    async (
      packageId: string,
      tierId: string,
      input: Partial<PackageTierInput>,
    ): Promise<Result> => {
      const res = await fetch(`${KEY}/${packageId}/tiers/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not update the tier."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteTier = useCallback(
    async (packageId: string, tierId: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${packageId}/tiers/${tierId}`, {
        method: "DELETE",
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not delete the tier."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  /** Merchant-side: request a package (snapshots the price server-side). */
  const requestPackage = useCallback(
    async (packageId: string, note?: string): Promise<Result> => {
      const res = await fetch(`${KEY}/${packageId}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not request the package."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    packages: data?.packages ?? [],
    activePackage: data?.activePackage ?? null,
    latestRequest: data?.latestRequest ?? null,
    isLoading,
    error,
    mutate,
    createPackage,
    updatePackage,
    deletePackage,
    addTier,
    updateTier,
    deleteTier,
    requestPackage,
  }
}
