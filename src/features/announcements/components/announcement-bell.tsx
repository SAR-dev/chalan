"use client"

import { Bell, BellOff, CheckCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useActiveAnnouncements } from "@/features/announcements/hooks/use-active-announcements"
import { formatDateTime } from "@/lib/format"
import { stripMarkdown } from "@/lib/markdown"
import { inboxPathForRole } from "@/lib/nav-config"

/**
 * The TopNav's announcements entry: unread badge + dropdown over the live
 * announcements. Replaces the old page-top banner — same single SWR fetch per
 * session (mounted once in TopNav), same shared read-set, but now a
 * pull surface instead of something that pushed into every page's content.
 *
 * Rows navigate to /announcements/[id]; the detail page performs the
 * mark-read, so this component never writes on its own. "Mark all read" is
 * the one bulk action it owns.
 */
export function AnnouncementBell() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const { announcements, unreadCount, markAllRead, isLoading } =
    useActiveAnnouncements()
  const [open, setOpen] = useState(false)

  const inboxHref = currentUser ? inboxPathForRole(currentUser.role) : null
  // 9+ keeps the badge from resizing the bar into a scoreboard.
  const badge = unreadCount > 9 ? "9+" : String(unreadCount)

  async function handleMarkAllRead() {
    const result = await markAllRead()
    if (!result.ok) toast.error(result.error ?? "Could not mark all as read.")
  }

  function openAnnouncement(id: string) {
    setOpen(false)
    router.push(`/announcements/${id}`)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              unreadCount > 0
                ? `Announcements, ${unreadCount} unread`
                : "Announcements"
            }
            data-testid="announcement-bell"
            className="relative"
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span
                data-testid="announcement-badge"
                className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
              >
                {badge}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Announcements</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleMarkAllRead}
              data-testid="announcement-mark-all"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div
          data-testid="announcement-list"
          className="max-h-80 overflow-y-auto"
        >
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="bg-muted h-10 rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <BellOff className="text-muted-foreground size-5" />
              <p className="text-sm font-medium">You&apos;re all caught up.</p>
              <p className="text-muted-foreground text-xs">
                No active announcements right now.
              </p>
            </div>
          ) : (
            announcements.map((a) => {
              const isRead = Boolean(a.readAt)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAnnouncement(a.id)}
                  data-testid={`announcement-item-${a.id}`}
                  className={`hover:bg-muted/50 flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    isRead ? "" : "bg-primary/5"
                  }`}
                >
                  {/* Unread dot — width-matched to the icon column below so
                      rows don't shift when something is read. */}
                  <span className="mt-1.5 flex size-2 shrink-0 items-center justify-center">
                    {!isRead && (
                      <span className="bg-primary relative flex size-2 rounded-full">
                        <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-60" />
                        <span className="bg-primary relative inline-flex size-2 rounded-full" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${isRead ? "text-muted-foreground font-normal" : "font-semibold"}`}
                    >
                      {a.title}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {stripMarkdown(a.content)}
                    </span>
                    {a.publishedAt && (
                      <time className="text-muted-foreground/70 mt-0.5 block text-[11px]">
                        {formatDateTime(a.publishedAt, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {inboxHref && (
          <div className="border-border border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={inboxHref} />}
              nativeButton={false}
              data-testid="announcement-open-inbox"
              className="w-full justify-center"
              onClick={() => setOpen(false)}
            >
              Open inbox
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
