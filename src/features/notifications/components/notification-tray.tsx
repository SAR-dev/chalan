"use client"

import { Bell, Inbox } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  type AppNotification,
  useNotifications,
} from "@/features/notifications/hooks/use-notifications"
import { formatDateTime } from "@/lib/format"

// =============================================================================
// The notification tray — what the TopNav bell opens.
//
// It sits beside the announcement bell rather than replacing it. The bell has
// always been a link to a board everyone reads; this is addressed mail about
// specific orders, with an unread badge that drains when you open it. Merging
// them would give one button two unrelated jobs and two different "unread"
// meanings.
//
// Rendering as a sheet follows `right-nav.tsx`: the codebase has one pattern for
// a panel opened from the right edge, and inventing a second one here would
// leave two idioms to learn.
// =============================================================================

/**
 * "just now" / "12m ago" for the last week, then an absolute date.
 *
 * Relative wording past a week reads as noise ("34d ago"), and the absolute
 * branch goes through `formatDateTime` so it honours BUSINESS_TIMEZONE — the
 * same rule every other timestamp in the app follows.
 */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDateTime(iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function NotificationTray({
  trigger,
}: {
  /**
   * The control that opens the tray. Wrapped in a `SheetTrigger`, so a plain
   * button is enough — Base UI's dialog only toggles from its own trigger, and
   * a bare child would render but never open.
   */
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Fetched only once the tray has actually been opened. Mounting it eagerly
  // would pull 50 rows on every merchant page load for a panel most visits never
  // look at; the badge already carries the number on its own endpoint.
  const [hasOpened, setHasOpened] = useState(false)
  const { notifications, markSeen, isLoading } = useNotifications({
    enabled: hasOpened,
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        setHasOpened(true)
        // Opening the tray *is* the read: one watermark write drains the badge,
        // rather than a read receipt per row. Failing to stamp leaves the badge
        // showing, which is the honest state, so it is not a toast.
        void markSeen()
      }}
    >
      <SheetTrigger render={<span className="contents" />}>
        {trigger}
      </SheetTrigger>
      <SheetContent side="right" data-testid="notification-tray">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Updates about your orders, deliveries and payouts.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading && notifications.length === 0 ? (
            <p className="text-sidebar-foreground/60 p-4 text-sm">Loading…</p>
          ) : notifications.length === 0 ? (
            <div
              className="text-sidebar-foreground/60 flex flex-col items-center gap-2 p-8 text-center"
              data-testid="notification-empty"
            >
              <Inbox className="size-6" aria-hidden />
              <p className="text-sm">Nothing yet.</p>
              <p className="text-xs">
                You will be notified here when an order moves.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {notifications.map((n) => (
                <TrayRow key={n.id} notification={n} />
              ))}
            </ul>
          )}
        </div>

        <div className="border-sidebar-border border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            render={<Link href="/merchant/notifications" />}
            nativeButton={false}
            data-testid="notification-tray-all"
          >
            <Bell className="size-4" aria-hidden />
            View all
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function TrayRow({ notification }: { notification: AppNotification }) {
  const now = Date.now()
  return (
    <li className="border-sidebar-border border-b last:border-b-0">
      <Link
        href={notification.href}
        className="hover:bg-sidebar-accent/50 block px-4 py-3 transition-colors"
        data-testid="notification-tray-row"
      >
        <p className="text-sm font-medium">{notification.title}</p>
        <p className="text-sidebar-foreground/60 mt-0.5 text-xs">
          {notification.orderId ? `${notification.orderId} · ` : ""}
          {relativeTime(notification.createdAt, now)}
        </p>
      </Link>
    </li>
  )
}
