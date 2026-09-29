"use client"

import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

const KEY = "/api/platform-pricing"

/** Platform-default rates — the fallback for a city pair with no zone row. */
export interface PlatformPricingDefaults {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
  cancellationFee: number
}

export function usePlatformPricingPublic() {
  const { data, error, isLoading } = useSWR<PlatformPricingDefaults>(
    KEY,
    jsonFetcher,
    swrOptions,
  )

  return {
    platformDefaults: data ?? null,
    isLoading,
    error,
  }
}
