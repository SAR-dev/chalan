"use client"

import { Bell, BellOff, CheckCheck, Megaphone } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveAnnouncements } from "@/features/announcements/hooks/use-active-announcements"
import { formatDateTime } from "@/lib/format"
import { stripMarkdown } from "@/lib/markdown"

interface Props {
  title: string
  description: string
}

// Rows link to the dedicated /announcements/[id] page (the old detail modal
// was removed) — so opening one is a navigation: shareable URL, browser back,
// and the page itself marks the row read.
export function AnnouncementsInbox({ title, description }: Props) {
  const { announcements, readIds, unreadCount, markAllRead, isLoading } =
    useActiveAnnouncements()

  async function handleMarkAllRead() {
    const result = await markAllRead()
    if (!result.ok) toast.error(result.error ?? "Could not mark all as read.")
  }

  return (
    <>
      <PageHeader title={title} description={description}>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <BellOff className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">No active announcements</p>
              <p className="text-muted-foreground text-sm">
                You&apos;re all caught up. Check back later.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => {
            const isRead = readIds.has(a.id)
            return (
              <Link
                key={a.id}
                href={`/announcements/${a.id}`}
                data-testid={`inbox-row-${a.id}`}
                className={`group block w-full rounded-lg border text-left transition-colors ${
                  isRead
                    ? "bg-card border-border hover:bg-muted/50"
                    : "bg-card border-primary/30 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Unread dot */}
                  <div className="mt-1 flex size-5 shrink-0 items-center justify-center">
                    {isRead ? (
                      <Megaphone className="text-muted-foreground size-4" />
                    ) : (
                      <span className="relative flex size-2.5">
                        <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-50" />
                        <span className="bg-primary relative inline-flex size-2.5 rounded-full" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <p
                        className={`truncate text-sm ${isRead ? "text-muted-foreground font-normal" : "text-foreground font-semibold"}`}
                      >
                        {a.title}
                      </p>
                      {a.publishedAt && (
                        <time className="text-muted-foreground shrink-0 text-xs">
                          {formatDateTime(a.publishedAt, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                      {stripMarkdown(a.content)}
                    </p>
                  </div>

                  <Bell
                    className={`mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${isRead ? "text-muted-foreground" : "text-primary"}`}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
