"use client"

import { BellOff, Megaphone } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnnouncementFeed } from "@/features/announcements/hooks/use-active-announcements"
import { formatDateTime } from "@/lib/format"
import { stripMarkdown } from "@/lib/markdown"

interface Props {
  title: string
  description: string
}

/**
 * The announcements feed — a board, not an inbox. Every live announcement is
 * always visible (nothing is hidden by having "read" it), rows link to the
 * dedicated /announcements/[id] page, and mounting stamps the seen-watermark
 * so the TopNav badge drains. Items published since the last visit carry a
 * NEW pill for this visit only.
 */
export function AnnouncementsInbox({ title, description }: Props) {
  const { announcements, isNew, isLoading } = useAnnouncementFeed()

  return (
    <>
      <PageHeader title={title} description={description} />

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
                Check back later — anything posted for your role shows up here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => {
            const fresh = isNew(a.id)
            return (
              <Link
                key={a.id}
                href={`/announcements/${a.id}`}
                data-testid={`inbox-row-${a.id}`}
                className={`group block w-full rounded-lg border text-left transition-colors ${
                  fresh
                    ? "bg-card border-primary/30 hover:bg-muted/50"
                    : "bg-card border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-1 flex size-5 shrink-0 items-center justify-center">
                    <Megaphone
                      className={`size-4 ${fresh ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <p
                        className={`truncate text-sm ${fresh ? "text-foreground font-semibold" : "text-muted-foreground font-normal"}`}
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

                  {/* NEW pill — reflects "published since your last visit",
                      not a read receipt; it clears next visit. */}
                  {fresh && (
                    <span
                      data-testid={`inbox-new-${a.id}`}
                      className="bg-primary text-primary-foreground mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                    >
                      NEW
                    </span>
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
