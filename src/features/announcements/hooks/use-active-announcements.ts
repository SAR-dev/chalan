"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { Announcement } from "@/lib/types"

const KEY = "/api/announcements/active"

// Announcements are broadcasts, not per-recipient messages — so this hook
// deliberately has NO per-item read state (the old `announcement_read` table
// and mark-read endpoints are gone; see the tombstone in
// src/lib/db/schema.postgres/platform.ts). The single fact the badge needs is
// "new since you last visited the feed": the server flags each row `isNew`
// against `profile.announcementsSeenAt`, and `markSeen()` advances that
// watermark for the whole feed in one write.
export type ActiveAnnouncement = Announcement & {
  /** Published after the reader's last feed visit. */
  isNew: boolean
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

  const newCount = announcements.filter((a) => a.isNew).length

  // Advances the feed watermark to now. Optimistically flips every row to
  // isNew=false so the badge drains on the same tick the POST lands — the
  // server's next response computes the same thing from the new watermark,
  // so there is nothing to revalidate.
  const markSeen = useCallback(async (): Promise<MutationResult> => {
    const result = await post("/api/announcements/seen")
    if (result.ok) {
      await mutate(
        (rows?: ActiveAnnouncement[]) =>
          (rows ?? []).map((row) => ({ ...row, isNew: false })),
        { revalidate: false, populateCache: true },
      )
    }
    return result
  }, [mutate])

  return {
    announcements,
    newCount,
    markSeen,
    isLoading,
    error,
  }
}

/**
 * The announcements *feed* (the one page that represents the board): captures
 * which rows were new on arrival, then stamps the watermark once so the
 * TopNav badge drains.
 *
 * The snapshot matters: stamping flips `isNew` to false everywhere, and
 * without pinning the NEW pills would vanish before the reader could use them
 * — they survive for this visit (and rows published while you sit on the
 * feed still arrive with isNew=true and pill normally).
 */
export function useAnnouncementFeed(options?: {
  initialData?: ActiveAnnouncement[]
}) {
  const { announcements, markSeen, isLoading, error } =
    useActiveAnnouncements(options)

  const [pinnedNew, setPinnedNew] = useState<ReadonlySet<string> | null>(null)
  const stampedRef = useRef(false)

  // Pin once, on first non-empty data.
  useEffect(() => {
    if (pinnedNew !== null || isLoading || announcements.length === 0) return
    setPinnedNew(new Set(announcements.filter((a) => a.isNew).map((a) => a.id)))
  }, [announcements, isLoading, pinnedNew])

  // Stamp once per mount, and only when there was actually something new —
  // an already-seen feed needs no write. Passive hydration, so failures are
  // not surfaced as toasts: the pills and badge simply stay until the next
  // visit, which is the honest state anyway.
  useEffect(() => {
    if (stampedRef.current || pinnedNew === null || pinnedNew.size === 0) return
    stampedRef.current = true
    void markSeen()
  }, [pinnedNew, markSeen])

  /** Pill predicate: pinned-new survives the stamp, live isNew covers rows
   * published while this feed is open. */
  const isNew = useCallback(
    (id: string) =>
      Boolean(pinnedNew?.has(id)) ||
      announcements.find((a) => a.id === id)?.isNew === true,
    [pinnedNew, announcements],
  )

  return {
    announcements,
    isNew,
    isLoading,
    error,
  }
}
