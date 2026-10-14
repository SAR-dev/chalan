"use client"

import { Megaphone } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementPopover } from "@/features/announcements/components/announcement-popover"
import { useActiveAnnouncements } from "@/features/announcements/hooks/use-active-announcements"
import { announcementsPathForRole } from "@/lib/nav-config"

/**
 * The TopNav's announcements entry: two controls, one per breakpoint, both
 * rendered and one hidden by CSS — the same shape as NotificationBell, for
 * the same reasons (a JS media query would render the wrong control on the
 * server and flip it on hydration).
 *
 * - Below `sm` this is a `Link` to the full feed: a 380px popover on a
 *   390px phone is a modal pretending to be a panel, and the feed is one tap
 *   away anyway.
 * - At `sm` and above it opens `AnnouncementPopover`, which renders every
 *   announcement in full and stamps the watermark on open, draining this
 *   badge (same SWR key, so the count clears without a refetch).
 *
 * Announcements remain a broadcast board — the pill is "new since your last
 * look", never a per-item read receipt (the `announcement_read` table stays
 * deleted; see the tombstone in schema.postgres/platform.ts).
 */
export function AnnouncementBell() {
  const { currentUser } = useAuth()
  const { newCount } = useActiveAnnouncements()
  const href = currentUser
    ? announcementsPathForRole(currentUser.role)
    : "/login"

  // 9+ keeps the badge from resizing the bar into a scoreboard.
  const badge = newCount > 9 ? "9+" : String(newCount)
  const label =
    newCount > 0 ? `Announcements, ${newCount} new` : "Announcements"

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
      {/* Mobile: the full list. */}
      <Link
        href={href}
        aria-label={label}
        title="Announcements"
        data-testid="announcement-bell-page"
        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative inline-flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none sm:hidden"
      >
        <Megaphone className="size-4" aria-hidden />
        {badgeNode("announcement-badge-mobile")}
      </Link>

      {/* Desktop: the popover. */}
      <span className="hidden sm:inline-flex">
        <AnnouncementPopover
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              data-testid="announcement-bell"
              // Icon-only next to the notification bell, so the glyph carries
              // the meaning. `Megaphone` matches the sidebar's Announcements
              // entry; the two must not both be a generic `Bell`, which is
              // what they were — the bar showed two identical icons for two
              // unrelated things.
              title="Announcements"
              className="relative"
            >
              <Megaphone className="size-4" aria-hidden />
              {badgeNode("announcement-badge")}
            </Button>
          }
        />
      </span>
    </>
  )
}
