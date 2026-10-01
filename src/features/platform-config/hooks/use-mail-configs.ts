"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { formatError } from "@/lib/validation"

const KEY = "/api/admin/mail-config"

export interface MailConfigRecord {
  id: string
  label: string
  host: string
  port: string
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Mail configs (SMTP servers) for the platform-settings page.
 *
 * SWR rather than `useState` + `fetch`, because every other table on the admin
 * side is SWR-backed and this one had drifted. Two concrete consequences of the
 * drift, both visible as "the rows vanished and a skeleton came back":
 *
 * 1. `useState` lives and dies with the component. Any remount — a re-render
 *    that re-creates the element, a router transition, React remounting after a
 *    suspended boundary — reset the list to `[]` while `loading` was true, so
 *    the table rendered skeleton rows for data the server still had. SWR's
 *    cache is above the component, so a remount reads the last response back
 *    synchronously and the rows never leave.
 * 2. `isLoading` from SWR is false during a *revalidation* (it only marks the
 *    first load), which is why the hook exposes `isRefreshing` separately —
 *    `loading={isLoading || isRefreshing}` is what the DataTable needs to draw
 *    its overlay instead of skeletons.
 *
 * `jsonFetcher` sends `cache: "no-store"`, so a refresh always reaches the
 * server; the previous implementation's bare `fetch` was free to be answered
 * from the browser cache, which could re-render stale rows over a fresh list.
 */
export function useMailConfigs() {
  const { currentUser } = useAuth()

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    MailConfigRecord[]
  >(isSuperAdmin ? KEY : null, jsonFetcher, swrOptions)

  const mailConfigs = data ?? []

  const createMailConfig = useCallback(
    async (input: {
      label: string
      host: string
      port: string
      secure: boolean
      user: string
      pass: string
      fromEmail: string
      fromName: string
    }): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(body, "Failed to create config."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const testMailConfig = useCallback(
    async (input: {
      host: string
      port: string
      secure: boolean
      user: string
      pass: string
      fromEmail: string
      fromName: string
    }): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`${KEY}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(body, "Failed to send test email."),
        }
      }
      return { ok: true }
    },
    [],
  )

  const activateMailConfig = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`${KEY}/${id}/activate`, { method: "PATCH" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(body, "Failed to activate config."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const deleteMailConfig = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return {
          ok: false,
          error: formatError(body, "Failed to delete config."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    mailConfigs,
    isLoading,
    isRefreshing: isValidating,
    error,
    refresh: mutate,
    createMailConfig,
    testMailConfig,
    activateMailConfig,
    deleteMailConfig,
  }
}
