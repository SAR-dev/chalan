"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { formatError } from "@/lib/validation"

export interface ModeratorAccount {
  userId: string
  name: string
  email: string
  status: "ACTIVE" | "PENDING" | "DEACTIVATED"
  permissions: string[]
  activatedAt: string | null
  createdAt: string
}

interface ModeratorsResponse {
  data: ModeratorAccount[]
  total: number
  quota: { used: number; max: number }
}

type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string }

/**
 * Moderator accounts for one merchant (owner-only API). `quota.used`
 * counts ACTIVE + PENDING members against `merchant.maxModerators`.
 */
export function useMerchantModerators(merchantId: string | undefined) {
  const key = merchantId ? `/api/merchants/${merchantId}/moderators` : null

  const { data, error, isLoading, mutate } = useSWR<ModeratorsResponse>(
    key,
    jsonFetcher,
    swrOptions,
  )

  const createModerator = useCallback(
    async (input: {
      name: string
      email: string
      password: string
      permissions: string[]
    }): Promise<ActionResult> => {
      if (!key) return { ok: false, error: "No merchant." }
      const res = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not create the moderator."),
        }
      }
      await mutate()
      return { ok: true, data: body }
    },
    [key, mutate],
  )

  const updateModerator = useCallback(
    async (
      userId: string,
      input: { permissions?: string[]; isActive?: boolean },
    ): Promise<ActionResult> => {
      if (!key) return { ok: false, error: "No merchant." }
      const res = await fetch(`${key}/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not update the moderator."),
        }
      }
      await mutate()
      return { ok: true, data: body }
    },
    [key, mutate],
  )

  const resendActivation = useCallback(
    async (userId: string): Promise<ActionResult> => {
      if (!key) return { ok: false, error: "No merchant." }
      const res = await fetch(`${key}/${userId}/resend-activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not resend the activation email."),
        }
      }
      return { ok: true, data: body }
    },
    [key],
  )

  return {
    moderators: data?.data ?? [],
    quota: data?.quota,
    total: data?.total ?? 0,
    isLoading,
    error,
    mutate,
    createModerator,
    updateModerator,
    resendActivation,
  }
}
