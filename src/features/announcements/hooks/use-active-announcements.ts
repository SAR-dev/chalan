"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { Announcement } from "@/lib/types"

const KEY = "/api/announcements/active"

// Read state is server-side (`announcement_read`), so it follows the account
// across devices: the localStorage `ann_read:<userId>` key is gone. Every row
// arrives with `readAt` (null = unread) and the derived sets below are pure
// functions of the SWR cache — no local mirror, no hydration effect.
//
// Structurally identical to AnnouncementWithRead in src/lib/announcements.ts
// (the server helper) — this is the client half of the same contract.
export type ActiveAnnouncement = Announcement & {
  readAt: string | null
}

type MutationResult = { ok: boolean; error?: string }

async function post(url: string): Promise<MutationResult> {
  try {
    const res = await fetch(url, { method: "POST" })
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = (data as { error?: string }).error
      return { ok: false, error: message ?? "Failed to update announcements." }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Failed to update announcements." }
  }
}

export function useActiveAnnouncements({
  initialData,
}: {
  initialData?: ActiveAnnouncement[]
} = {}) {
  const { currentUser } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()

  const {
    data: announcements = initialData ?? [],
    isLoading,
    error,
    mutate,
  } = useSWR<ActiveAnnouncement[]>(
    currentUser ? KEY : null,
    jsonFetcher,
    initialData ? { ...swrOptions, fallbackData: initialData } : swrOptions,
  )

  const readIds = new Set(
    announcements.filter((a) => a.readAt).map((a) => a.id),
  )
  const unreadCount = announcements.length - readIds.size

  // Optimistic: paint the row as read before the POST lands, then let the
  // server response settle it. `populateCache` writes through the same key
  // the badge reads, so the count drops immediately; a failed POST falls back
  // to the server truth on the next revalidation rather than lying.
  const markRead = useCallback(
    async (id: string): Promise<MutationResult> => {
      const result = await post(`/api/announcements/${id}/read`)
      if (result.ok) {
        await mutate(
          (rows?: ActiveAnnouncement[]) =>
            (rows ?? []).map((row) =>
              row.id === id && !row.readAt
                ? { ...row, readAt: new Date().toISOString() }
                : row,
            ),
          { revalidate: false, populateCache: true },
        )
      }
      return result
    },
    [mutate],
  )

  const markAllRead = useCallback(async (): Promise<MutationResult> => {
    const result = await post("/api/announcements/read-all")
    if (result.ok) {
      const now = new Date().toISOString()
      await mutate(
        (rows?: ActiveAnnouncement[]) =>
          (rows ?? []).map((row) =>
            row.readAt ? row : { ...row, readAt: now },
          ),
        { revalidate: false, populateCache: true },
      )
      // The badge and the list share one key today; revalidate anyway so a
      // server-side count mismatch (e.g. another tab) cannot persist.
      await globalMutate((key: string) => key === KEY)
    }
    return result
  }, [mutate, globalMutate])

  return {
    announcements,
    readIds,
    unreadCount,
    markRead,
    markAllRead,
    isLoading,
    error,
  }
}
