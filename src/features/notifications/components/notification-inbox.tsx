"use client"

import { Inbox } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationEventIcon } from "@/features/notifications/components/notification-event-icon"
import { useNotificationFeed } from "@/features/notifications/hooks/use-notifications"
import { formatDateTime } from "@/lib/format"

/**
 * The full notification inbox — the destination the tray's "View all" links to.
 *
 * Newest first and never paginated past 50: a merchant's working set is what
 * happened in the last few hours, and the tray exists for the same window. A
 * NEW pill marks rows that arrived since the last visit, cleared by the single
 * watermark write this page makes on mount.
 */
interface Props {
  title: string
  description: string
}

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

export function NotificationInbox({ title, description }: Props) {
  const { groups, isLoading } = useNotificationFeed()

  return (
    <>
      <PageHeader title={title} description={description} />

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
            <Link
              key={g.key}
              href={g.href}
              data-testid={`notification-row-${g.key}`}
              className="bg-card hover:bg-muted/50 group block w-full rounded-lg border text-left transition-colors"
            >
              <div className="flex items-start gap-4 px-5 py-4">
                <NotificationEventIcon event={g.event} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <p
                      className={`truncate text-sm ${
                        g.isNew
                          ? "text-foreground font-semibold"
                          : "text-muted-foreground font-normal"
                      }`}
                    >
                      {g.title}
                    </p>
                    <time className="text-muted-foreground shrink-0 text-xs">
                      {/* Date alone left every row reading "Oct 13, 2026" —
                          which is most of them, because a busy day produces most
                          of a merchant's notifications. Showing the clock time
                          below a week out is what makes the list order legible;
                          older rows keep the date so the column stays narrow. */}
                      {formatNotificationTime(g.createdAt)}
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    <span className="truncate">
                      {g.orderId ?? "Payout"}
                      {g.actorName ? ` · by ${g.actorName}` : ""}
                    </span>
                    {/* How much happened under this row. Hidden at 1, since "1
                        update" is noise and the title already says one thing
                        happened. */}
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

                {g.isNew && (
                  <Badge
                    data-testid={`notification-new-${g.key}`}
                    className="mt-0.5 shrink-0"
                  >
                    NEW
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
