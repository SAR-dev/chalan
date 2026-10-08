"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import type { ApiKeyScope } from "@/lib/api-key-scopes"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { toast } from "@/lib/notify"
import { formatError } from "@/lib/validation"

// =============================================================================
// Merchant API keys + webhook endpoints (R2)
//
// Everything here is merchant-scoped: the routes derive the merchant from the
// session, never from the request body, so a key list cannot be pointed at
// another merchant's data.
//
// `createKey` is the one call that returns a usable secret. The response is
// held in component state, shown once, and dropped when the merchant dismisses
// it — there is no endpoint that can produce it a second time.
// =============================================================================

const KEYS_KEY = "/api/integrations/api-keys"
const HOOKS_KEY = "/api/integrations/webhooks"

export interface ApiKeyRecord {
  id: string
  label: string
  /** Non-secret display segment. Never the full key. */
  prefix: string
  scopes: string[]
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface WebhookEndpointRecord {
  id: string
  url: string
  events: string[]
  isActive: boolean
  failureCount: number
  disabledAt: string | null
  lastDeliveredAt: string | null
  createdAt: string
}

type Result = { ok: boolean; error?: string }

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const parsed = await res.json().catch(() => null)
  if (!res.ok) return { ok: false, error: parsed?.error ?? "Request failed." }
  return { ok: true, data: parsed as Record<string, unknown> }
}

export function useApiKeys() {
  const { currentUser } = useAuth()
  const isMerchant = currentUser?.role === "MERCHANT"
  const { data, isLoading, mutate } = useSWR<{ keys: ApiKeyRecord[] }>(
    isMerchant ? KEYS_KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const createKey = useCallback(
    async (
      label: string,
      scopes: ApiKeyScope[],
    ): Promise<Result & { plaintext?: string; id?: string }> => {
      const res = await call(KEYS_KEY, "POST", { label, scopes })
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(res.error, "Could not create the key."),
        }
      }
      await mutate()
      const body = res.data as { plaintext?: string; id?: string }
      return { ok: true, plaintext: body.plaintext, id: body.id }
    },
    [mutate],
  )

  /**
   * Revoke, not delete. The row survives so an incident review can still see
   * that the key existed and when it was last used.
   */
  const revokeKey = useCallback(
    async (id: string): Promise<Result> => {
      const res = await call(`${KEYS_KEY}/${id}/revoke`, "POST")
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(res.error, "Could not revoke the key."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    keys: data?.keys ?? [],
    isLoading,
    refresh: mutate,
    createKey,
    revokeKey,
  }
}

export function useWebhookEndpoints() {
  const { currentUser } = useAuth()
  const isMerchant = currentUser?.role === "MERCHANT"
  const { data, isLoading, mutate } = useSWR<{
    endpoints: WebhookEndpointRecord[]
  }>(isMerchant ? HOOKS_KEY : null, jsonFetcher, swrOptions)

  const [revealedSecret, setRevealedSecret] = useState<{
    url: string
    secret: string
  } | null>(null)

  const createEndpoint = useCallback(
    async (url: string, events: string[]): Promise<Result> => {
      const res = await call(HOOKS_KEY, "POST", { url, events })
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(res.error, "Could not register the endpoint."),
        }
      }
      await mutate()
      const body = res.data as { url?: string; secret?: string }
      // Shown once so the merchant can configure signature verification in
      // their own system — which they have to do, or every delivery is
      // unauthenticated from their side.
      setRevealedSecret({
        url: body.url ?? url,
        secret: body.secret ?? "",
      })
      return { ok: true }
    },
    [mutate],
  )

  const deleteEndpoint = useCallback(
    async (id: string): Promise<Result> => {
      const res = await call(`${HOOKS_KEY}/${id}`, "DELETE")
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(res.error, "Could not remove the endpoint."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    endpoints: data?.endpoints ?? [],
    isLoading,
    refresh: mutate,
    createEndpoint,
    deleteEndpoint,
    revealedSecret,
    dismissSecret: () => setRevealedSecret(null),
  }
}
