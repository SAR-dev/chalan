"use client"

import { Megaphone } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useActiveAnnouncements } from "@/features/announcements/hooks/use-active-announcements"
import { announcementsPathForRole } from "@/lib/nav-config"

/**
 * The TopNav's announcements entry: a plain link to the feed with a "new
 * since your last visit" badge. Deliberately NOT a notification tray — no
 * dropdown, no per-item list, no mark-all-read: announcements are a board you
 * visit, not messages addressed to you. The feed stamps the watermark on
 * open, which drains this badge (same SWR key, so the count clears without
 * a refetch).
 *
 * The tray-shaped dropdown stays deleted until R4.1 gives it a real
 * notification stream to host.
 */
export function AnnouncementBell() {
  const { currentUser } = useAuth()
  const { newCount } = useActiveAnnouncements()
  const href = currentUser
    ? announcementsPathForRole(currentUser.role)
    : "/login"

  // 9+ keeps the badge from resizing the bar into a scoreboard.
  const badge = newCount > 9 ? "9+" : String(newCount)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={
        newCount > 0 ? `Announcements, ${newCount} new` : "Announcements"
      }
      data-testid="announcement-bell"
      render={<Link href={href} />}
      nativeButton={false}
      // Icon-only next to the notification bell, so the glyph carries the
      // meaning. `Megaphone` matches the sidebar's Announcements entry; the two
      // must not both be a generic `Bell`, which is what they were — the bar
      // showed two identical icons for two unrelated things.
      title="Announcements"
      className="relative"
    >
      <Megaphone className="size-4" />
      {newCount > 0 && (
        <span
          data-testid="announcement-badge"
          className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
        >
          {badge}
        </span>
      )}
    </Button>
  )
}
