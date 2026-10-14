"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type GroupedEvent,
  NotificationList,
} from "@/features/notifications/components/notification-list"
import {
  useNotificationCount,
  useNotifications,
} from "@/features/notifications/hooks/use-notifications"

// =============================================================================
// The notification tray — what the desktop TopNav bell opens.
//
// A shell, not a renderer. Rows come from `NotificationList`, which the inbox
// page and the mobile page also render; the only thing that makes this the
// tray is the 360px anchored popover around it and the keyboard handling.
//
// It sits beside the announcement bell rather than replacing it. The bell
// opens its own panel of board posts; this is addressed mail about specific
// orders, with an unread badge. Merging them would give one button two
// unrelated jobs and two different "unread" meanings.
// =============================================================================

export function NotificationTray({
  trigger,
}: {
  /**
   * The control that opens the tray. Wrapped in a `PopoverTrigger`, so a
   * plain button is enough — Base UI's popover only toggles from its own
   * trigger, and a bare child would render but never open.
   */
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Fetched only once the tray has actually been opened. Mounting it eagerly
  // would pull 50 rows on every merchant page load for a panel most visits never
  // look at; the badge already carries the number on its own endpoint.
  const [hasOpened, setHasOpened] = useState(false)
  const { notifications, groups, members, markRead, isLoading } =
    useNotifications({ enabled: hasOpened })
  const { newCount } = useNotificationCount()

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /**
   * Dismiss the tray when one of its links is followed.
   *
   * A `next/link` navigation is client-side, so the browser does not reload and
   * the popover's own `open` state is never told to change — the panel stays
   * open on top of the page it just opened. Closing on intent is also the
   * right feel: the user asked to go somewhere, not to keep reading the list.
   * Same fix as RightNav's links.
   */
  const closeTray = () => setOpen(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        setHasOpened(true)
      }}
    >
      <PopoverTrigger render={<span className="contents" />}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-testid="notification-tray"
        aria-label="Notifications"
        className="w-[360px] p-0"
      >
        <div className="border-sidebar-border flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Notifications
            {newCount > 0 && (
              <span
                data-testid="notification-tray-unread-count"
                className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              >
                {newCount} new
              </span>
            )}
          </h2>
        </div>

        <TrayLiveRegion count={newCount} />

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading && notifications.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Loading…</p>
          ) : (
            <NotificationList
              groups={groups}
              members={members}
              variant="tray"
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onOpen={(g) => {
                void markRead(g.ids)
                closeTray()
              }}
            />
          )}
        </div>

        <div className="border-sidebar-border border-t p-3">
          <Link
            href="/merchant/notifications"
            className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex w-full items-center justify-center rounded-md py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={closeTray}
            data-testid="notification-tray-all"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Announce arriving notifications without moving focus.
 *
 * A polite live region rather than a focus change: the reader is somewhere else
 * in the app and has not asked to be interrupted, but a merchant who has left
 * the tab open all afternoon should learn that their parcel arrived without
 * having to go and look.
 */
function TrayLiveRegion({ count }: { count: number }) {
  const previous = useRef(count)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (count > previous.current) {
      const delta = count - previous.current
      setMessage(
        `${delta} new notification${delta === 1 ? "" : "s"}. ${count} unread.`,
      )
    }
    previous.current = count
  }, [count])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="notification-live-region"
    >
      {message}
    </div>
  )
}

export type { GroupedEvent }
