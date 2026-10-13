"use client"

import { useCallback, useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { groupNotifications } from "@/lib/notification-group"

const LIST_KEY = "/api/notifications?limit=50"
const COUNT_KEY = "/api/notifications?count=1"

/**
 * How often the badge re-checks.
 *
 * The badge has to stay live while the shell sits idle, or a merchant finds out
 * their parcel was delivered only on their next navigation. 30s is frequent
 * enough to feel immediate and cheap enough to sit behind every merchant tab
 * all day — and SWR pauses it on a hidden tab by default, so a backgrounded
 * browser stops asking entirely.
 */
const POLL_INTERVAL_MS = 30_000

export interface AppNotification {
  id: string
  event: string
  orderId: string | null
  merchantId: string | null
  actorName: string | null
  title: string
  href: string
  createdAt: string
  /** "Notify Recipient → Barisal", snapshotted at event time. */
  subject?: string | null
  /** Null while unread. */
  readAt?: string | null
}

export interface NotificationFeed {
  notifications: AppNotification[]
  newCount: number
}

type MutationResult = { ok: boolean; error?: string }

/**
 * Whether this reader has an inbox at all.
 *
 * Only merchants receive notifications today: warehouse admins and riders work
 * from their own queues, and a superadmin's activity is the whole platform
 * rather than a personal stream. One predicate, so the bell, the nav entry and
 * the API cannot disagree about who is included.
 */
export function useHasNotifications(): boolean {
  const { currentUser } = useAuth()
  return currentUser?.role === "MERCHANT"
}

/**
 * The inbox list plus its unread count.
 *
 * `enabled` lets a caller defer the fetch — the tray passes it so the list is
 * not pulled on every page load for a panel that may never be opened. It
 * defaults to the reader having an inbox at all; the two gates are different
 * (role vs. opened-yet) and either can withhold the request.
 */
export function useNotifications({
  enabled: override,
}: {
  enabled?: boolean
} = {}) {
  const hasInbox = useHasNotifications()
  const enabled = override ?? hasInbox
  const { mutate: globalMutate } = useSWRConfig()

  const { data, isLoading, error, mutate } = useSWR<NotificationFeed>(
    enabled ? LIST_KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const notifications = data?.notifications ?? []

  /**
   * Mark specific notifications read.
   *
   * Optimistic, because the alternative is the badge lying for a round trip on
   * every row click — which is the exact moment the old watermark model was
   * papering over. Safe here because read state is monotonic and idempotent: the
   * server never *unreads* a row, so a failed request can leave the badge
   * briefly over-counted but never under.
   */
  const markRead = useCallback(
    async (ids: string[]): Promise<MutationResult> => {
      if (ids.length === 0) return { ok: true }
      const previous = data
      const now = new Date().toISOString()
      const idSet = new Set(ids)

      await globalMutate<NotificationFeed>(
        LIST_KEY,
        (current) =>
          current
            ? {
                ...current,
                notifications: current.notifications.map((n) =>
                  idSet.has(n.id) && !n.readAt ? { ...n, readAt: now } : n,
                ),
                newCount: current.notifications.filter(
                  (n) => idSet.has(n.id) && !n.readAt,
                ).length,
              }
            : current,
        { revalidate: false },
      )
      await globalMutate(COUNT_KEY, undefined, { revalidate: true })

      try {
        const res = await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        })
        if (!res.ok) {
          // Roll back rather than leave a badge the server disagrees with.
          await globalMutate(LIST_KEY, previous, { revalidate: false })
          await globalMutate(COUNT_KEY, undefined, { revalidate: true })
          return { ok: false, error: "Could not mark those as read." }
        }
        return { ok: true }
      } catch {
        await globalMutate(LIST_KEY, previous, { revalidate: false })
        await globalMutate(COUNT_KEY, undefined, { revalidate: true })
        return { ok: false, error: "Could not mark those as read." }
      }
    },
    [data, globalMutate],
  )

  /** Mark everything unread and unarchived as read. */
  const markAllRead = useCallback(async (): Promise<MutationResult> => {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok)
        return { ok: false, error: "Could not mark your inbox read." }
      await globalMutate(LIST_KEY, undefined, { revalidate: true })
      await globalMutate(COUNT_KEY, undefined, { revalidate: true })
      return { ok: true }
    } catch {
      return { ok: false, error: "Could not mark your inbox read." }
    }
  }, [globalMutate])

  /**
   * Dismiss or restore a row.
   *
   * Revalidates rather than patching the cache: the row leaves a filtered list
   * entirely on archive, and hand-editing two caches to make it disappear is how
   * the badge and the list drift apart.
   */
  const setArchived = useCallback(
    async (id: string, archived: boolean): Promise<MutationResult> => {
      try {
        const res = await fetch(`/api/notifications/${id}/archive`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archived }),
        })
        if (!res.ok) {
          return { ok: false, error: "Could not update that notification." }
        }
        await globalMutate(LIST_KEY, undefined, { revalidate: true })
        await globalMutate(COUNT_KEY, undefined, { revalidate: true })
        return { ok: true }
      } catch {
        return { ok: false, error: "Could not update that notification." }
      }
    },
    [globalMutate],
  )

  return {
    notifications,
    /** One row per order — see `groupNotifications`. */
    groups: useMemo(() => groupNotifications(notifications), [notifications]),
    newCount: data?.newCount ?? 0,
    markRead,
    markAllRead,
    setArchived,
    isLoading,
    error,
  }
}

/**
 * The TopNav badge number alone.
 *
 * A separate key from the list so the 30s tick is a `count(*)` rather than
 * fifty rows over the wire for a tray nobody has opened.
 */
export function useNotificationCount() {
  const hasInbox = useHasNotifications()
  const { data, isLoading } = useSWR<{ newCount: number }>(
    hasInbox ? COUNT_KEY : null,
    jsonFetcher,
    { ...swrOptions, refreshInterval: POLL_INTERVAL_MS },
  )

  return { newCount: data?.newCount ?? 0, isLoading }
}

/**
 * The inbox page.
 *
 * No pinning and no watermark write: read state now lives on the row, so opening
 * the inbox marks what is on screen as read and the pills reflect the server's
 * own answer. The client-side snapshot this replaces existed only because the
 * old model could not express "I have read this row".
 */
export function useNotificationFeed() {
  const {
    groups,
    newCount,
    markAllRead,
    setArchived,
    markRead,
    isLoading,
    error,
  } = useNotifications()

  return {
    groups,
    unreadCount: newCount,
    markAllRead,
    markRead,
    setArchived,
    isLoading,
    error,
  }
}
