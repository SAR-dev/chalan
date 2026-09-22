"use client"

import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

const KEY = "/api/zone-pricing"

export interface ZonePricingEstimate {
  id: string
  fromZoneId: string
  toZoneId: string
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
}

export function useZonePricingPublic() {
  const {
    data: pricing,
    error,
    isLoading,
  } = useSWR<ZonePricingEstimate[]>(KEY, jsonFetcher, swrOptions)

  return {
    pricing: pricing ?? [],
    isLoading,
    error,
  }
}
