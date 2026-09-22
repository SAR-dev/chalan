"use client"

import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { Announcement } from "@/lib/types"

const KEY = "/api/announcements/active"
// localStorage key — per user so switching accounts doesn't bleed state.
const storageKey = (userId: string) => `ann_read:${userId}`

function loadReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return new Set<string>()
    return new Set<string>(JSON.parse(raw) as string[])
  } catch {
    return new Set<string>()
  }
}

function saveReadIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function useActiveAnnouncements({
  initialData,
}: {
  initialData?: Announcement[]
} = {}) {
  const { currentUser } = useAuth()
  const userId = currentUser?.id ?? ""

  const {
    data: announcements = initialData ?? [],
    isLoading,
    error,
  } = useSWR<Announcement[]>(
    currentUser ? KEY : null,
    jsonFetcher,
    initialData ? { ...swrOptions, fallbackData: initialData } : swrOptions,
  )

  // Read IDs are kept in local state (synced from/to localStorage) so that
  // toggling read state triggers a re-render without a full SWR revalidation.
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  // Load from localStorage once the user is known.

  useEffect(() => {
    if (!userId) return
    setReadIds(loadReadIds(userId))
  }, [userId])

  const markRead = useCallback(
    (id: string) => {
      if (!userId) return
      setReadIds((prev) => {
        const next = new Set<string>(prev)
        next.add(id)
        saveReadIds(userId, next)
        return next
      })
    },
    [userId],
  )

  const markAllRead = useCallback(() => {
    if (!userId) return
    const all = new Set<string>(announcements.map((a) => a.id))
    setReadIds(all)
    saveReadIds(userId, all)
  }, [userId, announcements])

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length

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
