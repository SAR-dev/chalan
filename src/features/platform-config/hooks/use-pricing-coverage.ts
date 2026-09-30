"use client"

import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { PricingCoverage } from "@/lib/types"

const KEY = "/api/admin/pricing-coverage"

/**
 * Zone pairs that have no configured rate.
 *
 * Only super admins configure zone pricing, so the request is gated on the
 * role — other roles never hit a 403.
 */
export function usePricingCoverage() {
  const { currentUser } = useAuth()
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"

  const { data, error, isLoading } = useSWR<PricingCoverage>(
    isSuperAdmin ? KEY : null,
    jsonFetcher,
    swrOptions,
  )

  return {
    coverage: data ?? null,
    missing: data?.missing ?? [],
    isLoading,
    error,
  }
}
