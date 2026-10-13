"use client"

import { useCallback, useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import type { GroupedEvent } from "@/features/notifications/components/notification-list"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { groupNotifications } from "@/lib/notification-group"

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
  /** Set once dismissed. Present only in the archived scope. */
  archivedAt?: string | null
}

export interface NotificationFeed {
  notifications: AppNotification[]
  newCount: number
}

type MutationResult = { ok: boolean; error?: string }

/**
 * Which inbox this hook is reading.
 *
 * `live` is the default. `archived` is a separate request rather than a filter
 * over the live one because the server keeps archived rows out of the default
 * query entirely — they exist to be *findable*, and a list that omitted them
 * would be a list you can never undo from.
 */
export type NotificationScope = "live" | "archived"

const listKey = (scope: NotificationScope) =>
  scope === "archived"
    ? "/api/notifications?limit=50&archived=1"
    : "/api/notifications?limit=50"

const COUNT_KEY = "/api/notifications?count=1"

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
  scope = "live",
}: {
  enabled?: boolean
  scope?: NotificationScope
} = {}) {
  const hasInbox = useHasNotifications()
  const enabled = override ?? hasInbox
  const { mutate: globalMutate } = useSWRConfig()
  const key = listKey(scope)

  const { data, isLoading, error } = useSWR<NotificationFeed>(
    enabled ? key : null,
    jsonFetcher,
    swrOptions,
  )

  const notifications = data?.notifications ?? []

  // One revalidation pass across every mounted key. A dismissal issued from the
  // inbox also changes what the tray would show, and revalidating only the key
  // this hook happens to be mounted with leaves the other surface stale until its
  // own 30s tick.
  const revalidateAll = useCallback(async () => {
    await globalMutate<NotificationFeed>(
      (k) => typeof k === "string" && k.startsWith("/api/notifications"),
      undefined,
      { revalidate: true },
    )
  }, [globalMutate])

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
        key,
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
          await globalMutate(key, previous, { revalidate: false })
          await globalMutate(COUNT_KEY, undefined, { revalidate: true })
          return { ok: false, error: "Could not mark those as read." }
        }
        return { ok: true }
      } catch {
        await globalMutate(key, previous, { revalidate: false })
        await globalMutate(COUNT_KEY, undefined, { revalidate: true })
        return { ok: false, error: "Could not mark those as read." }
      }
    },
    [data, globalMutate, key],
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
      await revalidateAll()
      return { ok: true }
    } catch {
      return { ok: false, error: "Could not mark your inbox read." }
    }
  }, [revalidateAll])

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
        await revalidateAll()
        return { ok: true }
      } catch {
        return { ok: false, error: "Could not update that notification." }
      }
    },
    [revalidateAll],
  )

  /**
   * Put a set of dismissed rows back.
   *
   * One request, not one per id: the undo lives in a toast that expires after
   * five seconds, and restoring sixty rows individually is how half of them come
   * back and half do not, with nothing to tell the reader which is which.
   */
  const restoreMany = useCallback(
    async (ids: string[]): Promise<MutationResult> => {
      if (ids.length === 0) return { ok: true }
      try {
        const res = await fetch("/api/notifications/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        })
        if (!res.ok)
          return { ok: false, error: "Could not restore those notifications." }
        await revalidateAll()
        return { ok: true }
      } catch {
        return { ok: false, error: "Could not restore those notifications." }
      }
    },
    [revalidateAll],
  )

  /**
   * Dismiss everything already read.
   *
   * Returns the ids it archived so the caller can offer an undo naming exactly
   * what came back, instead of a blanket restore that would also resurrect rows
   * dismissed deliberately last week.
   */
  const archiveAllRead = useCallback(async (): Promise<
    MutationResult & { ids: string[] }
  > => {
    try {
      const res = await fetch("/api/notifications/archive", { method: "POST" })
      const body = (await res.json().catch(() => null)) as {
        ids?: string[]
      } | null
      if (!res.ok)
        return {
          ok: false,
          error: "Could not archive your read notifications.",
          ids: [],
        }
      await revalidateAll()
      return { ok: true, ids: body?.ids ?? [] }
    } catch {
      return {
        ok: false,
        error: "Could not archive your read notifications.",
        ids: [],
      }
    }
  }, [revalidateAll])

  return {
    notifications,
    /** One row per order — see `groupNotifications`. */
    groups: useMemo(() => groupNotifications(notifications), [notifications]),
    /**
     * The rows behind each group, for expanding `×N`.
     *
     * A group carries only ids and a count, which is enough to mark it read but
     * not to tell the reader what the count covers. Without this an expanded
     * group would render three empty lines — technically responsive, useless.
     */
    members: useMemo(() => groupMembers(notifications), [notifications]),
    newCount: data?.newCount ?? 0,
    markRead,
    markAllRead,
    setArchived,
    restoreMany,
    archiveAllRead,
    isLoading,
    error,
  }
}

/** Group key → its rows, newest first. Mirrors `groupNotifications`' ordering. */
function groupMembers(
  notifications: AppNotification[],
): Map<string, GroupedEvent[]> {
  const map = new Map<string, GroupedEvent[]>()
  for (const n of notifications) {
    if (!n.orderId) continue
    const list = map.get(n.orderId)
    const member: GroupedEvent = {
      id: n.id,
      event: n.event,
      title: n.title,
      createdAt: n.createdAt,
      actorName: n.actorName,
      readAt: n.readAt ?? null,
    }
    if (list) list.push(member)
    else map.set(n.orderId, [member])
  }
  return map
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
export function useNotificationFeed({
  scope = "live",
}: {
  scope?: NotificationScope
} = {}) {
  const {
    groups,
    members,
    newCount,
    markAllRead,
    setArchived,
    restoreMany,
    archiveAllRead,
    markRead,
    isLoading,
    error,
  } = useNotifications({ scope })

  return {
    groups,
    members,
    unreadCount: newCount,
    markAllRead,
    markRead,
    setArchived,
    restoreMany,
    archiveAllRead,
    isLoading,
    error,
  }
}
