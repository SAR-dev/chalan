"use client"

import { BellOff, Megaphone } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Markdown } from "@/components/markdown"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/features/account/hooks/use-auth"
import {
  type ActiveAnnouncement,
  useActiveAnnouncements,
  useAnnouncementNewness,
} from "@/features/announcements/hooks/use-active-announcements"
import { formatDateTime } from "@/lib/format"
import { announcementsPathForRole } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

// The "Earlier" section is a glance list, not the archive — the footer link
// carries the reader to everything. Unread is never capped: the unread set is
// the whole reason the popover exists, and hiding one behind a footer would
// leave a badge counting something the panel won't show.
const EARLIER_CAP = 10

/**
 * The desktop TopNav's announcements popover — the Facebook-shaped panel the
 * megaphone opens at `sm` and above (below `sm` the bell is a plain link to
 * the full feed; see announcement-bell.tsx).
 *
 * A reading surface, not a teaser: every announcement renders its complete
 * markdown body with no truncation, so opening the popover is genuinely
 * reading the board. Which is why opening it also stamps the watermark
 * (drains the badge), exactly like visiting the feed does — you have just
 * been shown everything that was new. The pill snapshot from
 * `useAnnouncementNewness` keeps the NEW marks in place for this visit even
 * though the count has drained.
 */
export function AnnouncementPopover({ trigger }: { trigger: React.ReactNode }) {
  const { currentUser } = useAuth()
  const { announcements, markSeen, isLoading } = useActiveAnnouncements()
  const { isNew, stamp } = useAnnouncementNewness({ announcements, markSeen })
  const [open, setOpen] = useState(false)

  const href = currentUser
    ? announcementsPathForRole(currentUser.role)
    : "/login"

  // Client-side navigation does not reload the page, so the popup's own
  // `open` state is never told to change — close it on intent, same fix as
  // the notification tray and RightNav.
  const close = () => setOpen(false)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // "I have read the board." No-op when nothing is new.
    if (next) stamp()
  }

  const unread = announcements.filter((a) => isNew(a.id))
  const earlier = announcements
    .filter((a) => !isNew(a.id))
    .slice(0, EARLIER_CAP)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<span className="contents" />}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-testid="announcement-popover"
        aria-label="Announcements"
        className="w-[380px] p-0"
      >
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Announcements</h2>
          {unread.length > 0 && (
            <span
              data-testid="announcement-popover-unread-count"
              className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            >
              {unread.length} new
            </span>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          data-testid="announcement-popover-list"
        >
          {isLoading && announcements.length === 0 ? (
            <div className="space-y-4 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div
              data-testid="announcement-popover-empty"
              className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center"
            >
              <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                <BellOff className="size-5" aria-hidden />
              </div>
              <p className="text-foreground text-sm font-medium">
                You&apos;re all caught up
              </p>
              <p className="max-w-56 text-xs">
                Anything posted for your role shows up here.
              </p>
            </div>
          ) : (
            <>
              {unread.length > 0 && (
                <Section id="new" label={`New (${unread.length})`}>
                  {unread.map((a) => (
                    <Item
                      key={a.id}
                      announcement={a}
                      fresh={isNew(a.id)}
                      onNavigate={close}
                    />
                  ))}
                </Section>
              )}
              {earlier.length > 0 && (
                <Section id="earlier" label="Earlier">
                  {earlier.map((a) => (
                    <Item
                      key={a.id}
                      announcement={a}
                      fresh={isNew(a.id)}
                      onNavigate={close}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        <div className="border-border border-t p-3">
          <Link
            href={href}
            onClick={close}
            data-testid="announcement-popover-all"
            className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex w-full items-center justify-center rounded-md py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            See all announcements
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Section({
  id,
  label,
  children,
}: {
  id: "new" | "earlier"
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        data-testid={`announcement-popover-section-${id}`}
        className="text-muted-foreground bg-muted/50 px-4 py-1.5 text-[11px] font-semibold tracking-wide uppercase"
      >
        {label}
      </h3>
      <div className="divide-border/60 divide-y">{children}</div>
    </section>
  )
}

/**
 * One announcement, in full.
 *
 * The title wraps — never `truncate`: a board whose headlines are cut in half
 * is a board you have to open to understand, which is what the popover is
 * meant to save you from. The body renders its complete markdown below it,
 * unclamped; the popover scrolls as a whole rather than folding each post
 * into a summary.
 */
function Item({
  announcement,
  fresh,
  onNavigate,
}: {
  announcement: ActiveAnnouncement
  fresh: boolean
  onNavigate: () => void
}) {
  const a = announcement
  return (
    <article
      data-testid={`announcement-popover-item-${a.id}`}
      data-new={fresh || undefined}
      className={cn("px-4 py-3", fresh && "bg-primary/5")}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/announcements/${a.id}`}
          onClick={onNavigate}
          data-testid={`announcement-popover-open-${a.id}`}
          className="text-foreground focus-visible:ring-ring min-w-0 flex-1 rounded-md text-sm font-semibold break-words hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {a.title}
        </Link>
        {fresh && (
          <span
            data-testid={`announcement-popover-new-${a.id}`}
            className="bg-primary text-primary-foreground mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
          >
            NEW
          </span>
        )}
      </div>

      {a.publishedAt && (
        <time
          dateTime={a.publishedAt}
          className="text-muted-foreground mt-0.5 block text-xs"
        >
          {formatDateTime(a.publishedAt, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
      )}

      {/* Full body, never truncated. The heading/margin overrides pull the
          help-page markdown rhythm (mt-12 h2s, mb-4 paragraphs) down to
          panel density without forking the shared renderer. */}
      <div className="mt-1.5 max-w-full overflow-hidden [&_blockquote]:my-2 [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:border-0 [&_h3]:mb-1 [&_h3]:mt-2.5 [&_img]:h-auto [&_img]:max-w-full [&_ol]:mb-2 [&_pre]:my-2 [&_p:last-child]:mb-0 [&_table]:my-2 [&_ul]:mb-2">
        <Markdown content={a.content} />
      </div>
    </article>
  )
}
