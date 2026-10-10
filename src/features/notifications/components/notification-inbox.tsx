"use client"

import { Inbox } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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

export function NotificationInbox({ title, description }: Props) {
  const { notifications, isNew, isLoading } = useNotificationFeed()

  return (
    <>
      <PageHeader title={title} description={description} />

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
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
          {notifications.map((n) => {
            const fresh = isNew(n.id)
            return (
              <Link
                key={n.id}
                href={n.href}
                data-testid={`notification-row-${n.id}`}
                className="bg-card hover:bg-muted/50 group block w-full rounded-lg border text-left transition-colors"
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <p
                        className={`truncate text-sm ${
                          fresh
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground font-normal"
                        }`}
                      >
                        {n.title}
                      </p>
                      <time className="text-muted-foreground shrink-0 text-xs">
                        {formatDateTime(n.createdAt, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {n.orderId ?? "Payout"}
                      {n.actorName ? ` · by ${n.actorName}` : ""}
                    </p>
                  </div>

                  {fresh && (
                    <Badge
                      data-testid={`notification-new-${n.id}`}
                      className="mt-0.5 shrink-0"
                    >
                      NEW
                    </Badge>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
