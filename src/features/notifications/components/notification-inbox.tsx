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
import { cn } from "@/lib/utils"

/**
 * "2:59 AM · Oct 13" inside a week, "Oct 13, 2026" beyond it. Pass `compact`
 * for the narrow column a phone leaves behind.
 *
 * Notifications cluster: an order placed, approved, dispatched and delivered all
 * land within minutes of each other. Rendering only the date made an entire busy
 * day read identically, so the list gave the eye nothing to sort by. The week cut
 * keeps the column from turning into a wall of timestamps.
 */
export function formatNotificationTime(iso: string, compact = false): string {
  const then = new Date(iso).getTime()
  const ageMs = Date.now() - then
  const valid = Number.isFinite(ageMs)
  if (compact && valid) {
    // The absolute form below is ~120px. On a 390px viewport that is a third of
    // the row, and the title loses so much it reads "New order rece…" — the one
    // piece of text that says what happened.
    const minutes = Math.round(Math.max(0, ageMs) / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    if (days < 7) return `${days}d`
  }
  if (!valid || ageMs >= 7 * 24 * 60 * 60 * 1000) {
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
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        ) : null}
      </PageHeader>

      {isLoading ? (
        <div className="mx-auto max-w-4xl space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <Inbox className="size-6" aria-hidden />
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
        // Capped so the timestamp stays visually attached to the row it belongs
        // to. Stretched to a full 1280px the time sits 900px from its own
        // content and the eye has to work to pair them up.
        <div className="mx-auto max-w-4xl space-y-2">
          {groups.map((g) => (
            <div
              key={g.key}
              data-testid={`notification-row-${g.key}`}
              // Unread rows carry a left rule and a tinted ground so they read as
              // a queue to work through, not as a wall of identical cards. The
              // old model could not do this — every row was either all-new or
              // all-seen at once, because read state was one watermark.
              className={cn(
                "group relative flex items-start gap-4 rounded-lg border px-5 py-4 transition-colors hover:bg-muted/50",
                g.unread
                  ? // Measured at 4% the tint computed to plain white — byte for
                    // byte the same background as a read row, so the whole
                    // point of per-row read state was invisible. The solid left
                    // rule carries it; the tint only supports.
                    "bg-primary/5 border-primary/40 border-l-4"
                  : "bg-card",
              )}
            >
              <Link
                href={g.href}
                className="flex min-w-0 flex-1 items-start gap-4"
              >
                <NotificationEventIcon event={g.event} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    {/* Read rows step back by opacity, not hue. `text-muted-
                        foreground` also greys the text, which reads as disabled
                        rather than as "already dealt with" — the wrong signal for
                        a notification you may still want to act on. */}
                    <p
                      className={cn(
                        "truncate text-sm",
                        g.unread
                          ? "text-foreground font-semibold"
                          : "text-foreground/70 font-normal",
                      )}
                    >
                      {g.title}
                    </p>
                    <time className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {/* Two renderings rather than a measured one: the absolute
                          form costs ~120px, which on a 390px screen left the
                          title "New order rece…". Relative fits, and both come
                          from the same timestamp. */}
                      <span className="sm:hidden">
                        {formatNotificationTime(g.createdAt, true)}
                      </span>
                      <span className="hidden sm:inline">
                        {formatNotificationTime(g.createdAt)}
                      </span>
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    {/* The subject is the reason this list is usable: `ORD-100163`
                        on its own identifies nothing, so twenty rows were twenty
                        identical lines. Old rows fall back to the bare code. */}
                    <span className="truncate">
                      {[g.subject ?? "Payout", g.actorName]
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
                // Revealed on hover at `sm` and above, always visible below it.
                // `group-hover` alone left this at opacity 0 on a phone, where
                // there is no hover — the action existed and could not be reached.
                className="text-muted-foreground hover:text-foreground shrink-0 transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Archive notification about ${g.title}`}
                data-testid={`notification-archive-${g.key}`}
                onClick={() => void setArchived(g.ids[0], true)}
              >
                <Archive className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
