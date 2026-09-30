import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { PlatformConfig, PlatformConfigInput } from "@/lib/types"

const KEY = "/api/platform-config"

export function usePlatformConfig() {
  const { currentUser } = useAuth()

  const {
    data: config,
    error,
    isLoading,
    mutate,
  } = useSWR<PlatformConfig>(
    currentUser?.role === "SUPER_ADMIN" ? KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const updatePlatformConfig = useCallback(
    async (
      input: PlatformConfigInput,
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(KEY, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return { ok: false, error: body?.error ?? "Failed to update" }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    config,
    isLoading,
    error,
    updatePlatformConfig,
  }
}
