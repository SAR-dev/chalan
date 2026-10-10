"use client"

import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NotificationTray } from "@/features/notifications/components/notification-tray"
import { useNotificationCount } from "@/features/notifications/hooks/use-notifications"

/**
 * The TopNav entry point for in-app notifications.
 *
 * Rendered beside the announcement bell, not merged into it: announcements are
 * a broadcast board, these are addressed messages, and one button cannot carry
 * two unrelated unread counts honestly.
 */
export function NotificationBell() {
  const { newCount } = useNotificationCount()

  // 9+ keeps the badge from resizing the bar into a scoreboard.
  const badge = newCount > 9 ? "9+" : String(newCount)

  return (
    <NotificationTray
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            newCount > 0 ? `Notifications, ${newCount} new` : "Notifications"
          }
          data-testid="notification-bell"
          className="relative"
        >
          <Bell className="size-4" />
          {newCount > 0 && (
            <span
              data-testid="notification-badge"
              className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
            >
              {badge}
            </span>
          )}
        </Button>
      }
    />
  )
}
