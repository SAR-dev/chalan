"use client"

import { Archive, CheckCheck, Inbox, MailOpen, Undo2 } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  NotificationList,
  useNotificationKeyboard,
} from "@/features/notifications/components/notification-list"
import { useNotificationFeed } from "@/features/notifications/hooks/use-notifications"
import type { NotificationGroup } from "@/lib/notification-group"
import { toast } from "@/lib/notify"

// =============================================================================
// The notification inbox — a page on desktop, the full-screen list on mobile.
//
// One component for both. The viewport decides the container around the list; the
// rows, grouping, unread treatment and timestamps are `NotificationList`'s, so
// the two cannot drift the way the tray and inbox rows did.
// =============================================================================

type Tab = "unread" | "all" | "archived"

/** Long enough to find the button, short enough not to become a queue. */
const UNDO_MS = 5_000

export function NotificationInbox({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const [tab, setTab] = useState<Tab>("all")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const listRef = useRef<HTMLDivElement>(null)

  const isArchived = tab === "archived"
  const {
    groups,
    members,
    unreadCount,
    markAllRead,
    markRead,
    setArchived,
    restoreMany,
    archiveAllRead,
    isLoading,
  } = useNotificationFeed({ scope: isArchived ? "archived" : "live" })

  /**
   * The Unread tab is a client-side predicate over the live list rather than a
   * third server query.
   *
   * It is a strict subset of what `live` already returned, so a second request
   * would spend a round trip to re-derive rows the response is holding. The
   * filter runs after fetching, not instead of it, which is also what keeps the
   * tab count honest — it is computed from the same rows the tab shows.
   */
  // Archived rows are already absent from the live list — the server filters
  // them out of the query — so `unread` alone is the correct predicate here.
  const visible = useMemo(
    () => (tab === "unread" ? groups.filter((g) => g.unread) : groups),
    [groups, tab],
  )

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const groupFor = useCallback(
    (key: string) => visible.find((g) => g.key === key),
    [visible],
  )

  // Scoped to the list container: `e` and `u` are typing keys, and a global
  // listener would archive a row while the reader typed into a search box.
  useNotificationKeyboard({
    containerRef: listRef,
    onArchive: (key) => {
      const g = groupFor(key)
      if (g) void handleArchive(g)
    },
    onToggleRead: (key) => {
      const g = groupFor(key)
      if (g) void markRead(g.ids)
    },
  })

  /**
   * Archive a group, with an undo that outlives the row.
   *
   * Archiving used to be one-way, which made it a deletion wearing a softer name:
   * a mis-tap was unrecoverable and invisible, because the reader had no way to
   * see what had been dismissed. The toast closes that: five seconds to notice a
   * mistake, and `Archived` as the safety net behind it.
   */
  const handleArchive = useCallback(
    async (group: NotificationGroup) => {
      const ids = group.ids
      const result = await setArchived(ids[0], true)
      if (!result.ok) {
        toast.error(result.error ?? "Could not archive that notification.")
        return
      }
      // Undo is per group, not per row: a grouped row archives every event it
      // collapsed, so restoring only the newest would leave the rest lost.
      toast("Archived", {
        description: group.title,
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => void restoreMany(ids),
        },
      })
    },
    [restoreMany, setArchived],
  )

  const handleArchiveAllRead = useCallback(async () => {
    const result = await archiveAllRead()
    if (!result.ok) {
      toast.error(result.error ?? "Could not archive your read notifications.")
      return
    }
    if (result.ids.length === 0) {
      toast("Nothing to archive", {
        description: "You have no read notifications yet.",
      })
      return
    }
    toast(
      `Archived ${result.ids.length} read notification${result.ids.length === 1 ? "" : "s"}`,
      {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => void restoreMany(result.ids),
        },
      },
    )
  }, [archiveAllRead, restoreMany])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Hidden on mobile, where the sticky bar above already carries the
            title and the unread count — two headings saying "Notifications" one
            under the other, and the second one is the one that scrolls away. */}
        <div className="hidden min-w-0 sm:block">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {title}
            {unreadCount > 0 && !isArchived && (
              <span
                data-testid="notification-inbox-unread-count"
                className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
              >
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        {/* The mobile heading, so the page still has one on the small screen. */}
        <h1 className="sr-only sm:hidden">{title}</h1>

        {/* Header actions. Both are hidden rather than disabled when they would
            do nothing, so the header does not carry dead controls. */}
        {!isArchived && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleArchiveAllRead()}
              data-testid="notification-archive-all-read"
            >
              <Archive className="size-4" aria-hidden />
              <span className="hidden sm:inline">Archive read</span>
              <span className="sm:hidden">Archive</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              data-testid="notification-mark-all-read"
            >
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="unread" data-testid="notification-tab-unread">
            <MailOpen className="size-4" aria-hidden />
            Unread
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="notification-tab-all">
            <Inbox className="size-4" aria-hidden />
            All
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="notification-tab-archived">
            <Archive className="size-4" aria-hidden />
            Archived
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div ref={listRef}>
        {isLoading && groups.length === 0 ? (
          <div className="mx-auto max-w-4xl space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <NotificationList
              groups={visible}
              members={members}
              variant="page"
              expanded={expanded}
              stickyHeaders
              onToggleExpand={toggleExpand}
              archived={isArchived}
              onOpen={(g) => {
                // Read on open, not on mount. The old watermark had to sweep
                // everything the moment the page loaded; per-row state does not,
                // and marking all of it here is how a reader loses the unread
                // rows they never actually looked at.
                void markRead(g.ids)
              }}
              onArchive={(g) => void handleArchive(g)}
              onRestore={(g) => void setArchived(g.ids[0], false)}
              emptyState={
                isArchived ? (
                  <>
                    <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                      <Undo2 className="size-5" aria-hidden />
                    </div>
                    <p className="text-foreground text-sm font-medium">
                      Nothing archived
                    </p>
                    <p className="max-w-56 text-xs">
                      Dismissed notifications land here, and can be restored.
                    </p>
                  </>
                ) : tab === "unread" ? (
                  <>
                    <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                      <CheckCheck className="size-5" aria-hidden />
                    </div>
                    <p className="text-foreground text-sm font-medium">
                      You&apos;re all caught up
                    </p>
                    <p className="max-w-56 text-xs">
                      Every notification here has been read.
                    </p>
                  </>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
