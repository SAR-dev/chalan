"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"

const LIST_KEY = "/api/notifications?limit=50"
const COUNT_KEY = "/api/notifications?count=1"

/**
 * How often the badge re-checks.
 *
 * The badge has to stay live while the shell sits idle, or a merchant finds out
 * their parcel was delivered only on their next navigation. 30s is frequent
 * enough to feel immediate and cheap enough to sit behind every merchant tab
 * all day.
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

  const { data, isLoading, error, mutate } = useSWR<NotificationFeed>(
    enabled ? LIST_KEY : null,
    jsonFetcher,
    swrOptions,
  )

  const notifications = data?.notifications ?? []

  // Tracks whether a list has ever loaded, so `markSeen` can tell "drain the
  // badge" apart from "overwrite an inbox that has not arrived yet".
  const cacheRef = useRef(false)
  useEffect(() => {
    if (data) cacheRef.current = true
  }, [data])

  /**
   * Drains the badge in one write rather than tracking per-item read receipts,
   * and optimistically zeroes the count so the badge clears on the same tick the
   * POST lands. The server derives the same result from the new watermark, so
   * there is nothing to revalidate.
   */
  const markSeen = useCallback(async (): Promise<MutationResult> => {
    try {
      const res = await fetch("/api/notifications/seen", { method: "POST" })
      if (!res.ok) return { ok: false, error: "Failed to open your inbox." }
      // Only rewrite the cache if a list is actually loaded. On the tray's
      // first open the fetch may not have resolved yet, and writing
      // `{notifications: []}` there would cache an empty inbox over the rows
      // that are on their way — the tray would show "nothing yet" for a
      // merchant who has notifications.
      if (cacheRef.current) {
        await mutate(
          (prev?: NotificationFeed) => ({
            notifications: prev?.notifications ?? [],
            newCount: 0,
          }),
          { revalidate: false },
        )
      }
      return { ok: true }
    } catch {
      return { ok: false, error: "Failed to open your inbox." }
    }
  }, [mutate])

  return {
    notifications,
    newCount: data?.newCount ?? 0,
    markSeen,
    isLoading,
    error,
  }
}

/**
 * The TopNav badge number alone.
 *
 * Deliberately separate from `useNotifications`: polling the badge must not drag
 * 50 rows across the network every 30 seconds for a merchant who never opens the
 * tray. The tray fetches its own list when it opens, so the two never invalidate
 * each other.
 */
export function useNotificationCount() {
  const enabled = useHasNotifications()
  const pathname = usePathname()

  const { data, isLoading, mutate } = useSWR<{ newCount: number }>(
    enabled ? COUNT_KEY : null,
    jsonFetcher,
    { ...swrOptions, refreshInterval: POLL_INTERVAL_MS },
  )

  // Re-check on every navigation, not just on the poll tick.
  //
  // The action that raises a notification is nearly always followed by a route
  // change — place an order, land on the list; approve a payout, land on the
  // queue — so the badge would otherwise stay stale for up to a full poll
  // interval on exactly the screens where it matters most.
  useEffect(() => {
    if (!enabled) return
    void mutate()
  }, [pathname, enabled, mutate])

  return { newCount: data?.newCount ?? 0, isLoading }
}

/**
 * The inbox page: pin which rows were new on arrival, then stamp the watermark
 * once so the badge drains.
 *
 * The pin is what keeps the "new" pills on screen. Stamping drops `newCount` to
 * zero — without the snapshot the pills would vanish before the reader could use
 * them. The server returns rows newest-first and counts the unread ones, so the
 * new ones are exactly the leading `newCount` rows.
 */
export function useNotificationFeed() {
  const { notifications, newCount, markSeen, isLoading, error } =
    useNotifications()

  const [pinnedNew, setPinnedNew] = useState<ReadonlySet<string> | null>(null)
  const stampedRef = useRef(false)

  useEffect(() => {
    if (pinnedNew !== null || isLoading || notifications.length === 0) return
    setPinnedNew(new Set(notifications.slice(0, newCount).map((n) => n.id)))
  }, [notifications, isLoading, pinnedNew, newCount])

  // One write per mount, and only when there was something new to drain — an
  // already-seen inbox needs no write. Passive: a failure leaves the badge
  // showing, which is the honest state, so it is deliberately not a toast.
  useEffect(() => {
    if (stampedRef.current || pinnedNew === null || pinnedNew.size === 0) return
    stampedRef.current = true
    void markSeen()
  }, [pinnedNew, markSeen])

  /**
   * Pinned-new survives the stamp for this visit. Rows that arrive while the
   * page is open are not in the pin, so they fall through to the live count.
   */
  const isNew = useCallback(
    (id: string) => Boolean(pinnedNew?.has(id)),
    [pinnedNew],
  )

  return { notifications, isNew, isLoading, error }
}
