import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { ScanPolicy } from "@/lib/types"

const KEY = "/api/scan-policy"

/**
 * R9 scan toggles for the signed-in rider or warehouse admin (any role — the
 * route is behind plain `requireSession()`, not the superadmin
 * platform-config route).
 *
 * While the response is unresolved all four toggles resolve as `true`: that
 * matches the DB default, so a rider or warehouse admin never submits through
 * a gate that is about to appear. The only flicker possible is a gate
 * disappearing after an admin turns it off, never the reverse.
 */
export function useScanPolicy() {
  const { data, error, isLoading } = useSWR<ScanPolicy>(
    KEY,
    jsonFetcher,
    swrOptions,
  )

  return {
    pickupScanRequired: data?.pickupScanRequired ?? true,
    deliveryScanRequired: data?.deliveryScanRequired ?? true,
    warehouseScanRequired: data?.warehouseScanRequired ?? true,
    warehouseReceiveScanRequired: data?.warehouseReceiveScanRequired ?? true,
    isLoading,
    error,
  }
}
