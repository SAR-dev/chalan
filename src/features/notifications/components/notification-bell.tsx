"use client"

import { Inbox } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { NotificationTray } from "@/features/notifications/components/notification-tray"
import { useNotificationCount } from "@/features/notifications/hooks/use-notifications"

/**
 * The TopNav entry point for in-app notifications.
 *
 * Rendered beside the announcement bell, not merged into it: announcements are
 * a broadcast board, these are addressed messages, and one button cannot carry
 * two unrelated unread counts honestly.
 *
 * Two controls, one per breakpoint, rather than one control that changes
 * behaviour on resize:
 *
 * - Below `sm` this is a `Link` to the full-screen list. A 360px popover on a
 *   390px phone leaves the page a sliver beside it and gives every row two lines
 *   and a thumb-sized target in a column that was never designed for one.
 * - At `sm` and above it is the popover, which has room to be a popover.
 *
 * Both are rendered and one is hidden, rather than swapping on a media query in
 * JS. A `useMediaQuery` hook would render the wrong control on the server and
 * flip it on hydration — a visible popover of empty space, and a bell that does
 * not respond to the first tap on a phone. The tray costs nothing while closed:
 * it does not fetch until it is opened.
 */
export function NotificationBell() {
  const { newCount } = useNotificationCount()

  // 9+ keeps the badge from resizing the bar into a scoreboard.
  const badge = newCount > 9 ? "9+" : String(newCount)

  const label =
    newCount > 0 ? `Notifications, ${newCount} unread` : "Notifications"

  const badgeNode = (testId: string) =>
    newCount > 0 ? (
      <span
        data-testid={testId}
        className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
      >
        {badge}
      </span>
    ) : null

  return (
    <>
      {/* Mobile: the full-screen list. */}
      <Link
        href="/merchant/notifications"
        aria-label={label}
        title="Notifications"
        data-testid="notification-bell-page"
        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative inline-flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none sm:hidden"
      >
        <Inbox className="size-4" aria-hidden />
        {badgeNode("notification-badge-mobile")}
      </Link>

      {/* Desktop: the popover. */}
      <span className="hidden sm:inline-flex">
        <NotificationTray
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              data-testid="notification-bell"
              // Icon-only next to the announcement bell, so the glyph carries the
              // meaning. `Inbox` matches the sidebar's Notifications entry; the
              // two must not both be a generic `Bell`, which is what they were —
              // the bar showed two identical icons for two unrelated things.
              title="Notifications"
              className="relative"
            >
              <Inbox className="size-4" aria-hidden />
              {badgeNode("notification-badge")}
            </Button>
          }
        />
      </span>
    </>
  )
}
