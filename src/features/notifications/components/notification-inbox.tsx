"use client"

import { Archive, CheckCheck, Inbox } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationEventIcon } from "@/features/notifications/components/notification-event-icon"
import { useNotificationFeed } from "@/features/notifications/hooks/use-notifications"
import { formatDateTime } from "@/lib/format"

/**
 * "2:59 AM · Oct 13" inside a week, "Oct 13, 2026" beyond it.
 *
 * Notifications cluster: an order placed, approved, dispatched and delivered all
 * land within minutes of each other. Rendering only the date made an entire busy
 * day read identically, so the list gave the eye nothing to sort by. The week cut
 * keeps the column from turning into a wall of timestamps.
 */
function formatNotificationTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime()
  const recent = Number.isFinite(ageMs) && ageMs < 7 * 24 * 60 * 60 * 1000
  if (!recent) {
    return formatDateTime(iso, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }
  return `${formatDateTime(iso, { hour: "numeric", minute: "2-digit" })} · ${formatDateTime(iso, { month: "short", day: "numeric" })}`
}

export function NotificationInbox({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const { groups, unreadCount, markAllRead, setArchived, isLoading } =
    useNotificationFeed()

  return (
    <>
      <PageHeader title={title} description={description}>
        {unreadCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void markAllRead()}
            data-testid="notification-mark-all-read"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        ) : null}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <Inbox className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">No notifications yet</p>
              <p className="text-muted-foreground text-sm">
                When an order is placed, dispatched or delivered, it shows up
                here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.key}
              data-testid={`notification-row-${g.key}`}
              // Unread rows carry a left rule and a tinted ground so they read as
              // a queue to work through, not as a wall of identical cards. The
              // old model could not do this — every row was either all-new or
              // all-seen at once, because read state was one watermark.
              className={
                g.unread
                  ? "bg-primary/[0.04] border-primary/25 group relative flex items-start gap-4 rounded-lg border border-l-[3px] px-5 py-4 transition-colors hover:bg-muted/50"
                  : "bg-card group relative flex items-start gap-4 rounded-lg border px-5 py-4 transition-colors hover:bg-muted/50"
              }
            >
              <Link
                href={g.href}
                className="flex min-w-0 flex-1 items-start gap-4"
              >
                <NotificationEventIcon event={g.event} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <p
                      className={
                        g.unread
                          ? "text-foreground truncate text-sm font-semibold"
                          : "text-muted-foreground truncate text-sm font-normal"
                      }
                    >
                      {g.title}
                    </p>
                    <time className="text-muted-foreground shrink-0 text-xs">
                      {formatNotificationTime(g.createdAt)}
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    {/* The subject is the reason this list is usable: `ORD-100163`
                        on its own identifies nothing, so twenty rows were twenty
                        identical lines. Old rows fall back to the bare code. */}
                    <span className="truncate">
                      {[
                        g.subject ?? "Payout",
                        g.orderId,
                        g.actorName ? `by ${g.actorName}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {g.count > 1 && (
                      <span
                        data-testid={`notification-count-${g.key}`}
                        className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                      >
                        {g.count} updates
                      </span>
                    )}
                  </p>
                </div>
              </Link>

              {/* Dismissal is per row and separate from reading: an ops-heavy
                  merchant archives routine dispatch noise while still needing to
                  prove they saw a payout. */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Archive notification about ${g.title}`}
                data-testid={`notification-archive-${g.key}`}
                onClick={() => void setArchived(g.ids[0], true)}
              >
                <Archive className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
