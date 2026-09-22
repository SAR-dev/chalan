"use client"

import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AnnouncementDetailModal } from "@/features/announcements/components/announcement-detail-modal"
import { useActiveAnnouncements } from "@/features/announcements/hooks/use-active-announcements"
import type { Announcement } from "@/lib/types"

// Shows unread announcements as a dismissible banner above page content on
// app load. Cycles through unread items when there are multiple. Dismissed
// items are marked read via the existing localStorage-backed markRead() so
// they won't reappear across sessions.
export function AnnouncementBanner() {
  const { announcements, readIds, markRead } = useActiveAnnouncements()
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Announcement | null>(null)

  const unread = announcements.filter((a) => !readIds.has(a.id))

  if (unread.length === 0) return null

  // Clamp index in case items are dismissed and the list shrinks.
  const safeIndex = Math.min(index, unread.length - 1)
  const current = unread[safeIndex]
  const total = unread.length
  const hasMultiple = total > 1

  function dismiss() {
    markRead(current.id)
    // Stay on the same position; the list will shrink and safeIndex will clamp.
    // If this was the last item the banner unmounts via the guard above.
  }

  function prev() {
    setIndex((i) => (i - 1 + total) % total)
  }

  function next() {
    setIndex((i) => (i + 1) % total)
  }

  function openDetail() {
    setSelected(current)
  }

  function handleMarkRead(id: string) {
    markRead(id)
    // Advance to the next unread announcement after marking current as read.
    const nextUnread = announcements.filter(
      (a) => !readIds.has(a.id) && a.id !== id,
    )
    if (nextUnread.length > 0) {
      setSelected(nextUnread[0])
    } else {
      setSelected(null)
    }
  }

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="border-primary/20 bg-primary/5 mb-6 flex items-start gap-3 rounded-lg border p-4"
      >
        {/* Icon */}
        <Megaphone className="text-primary mt-0.5 size-4 shrink-0" />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={openDetail}
            className="hover:text-primary text-left transition-colors"
          >
            <p className="text-foreground text-sm font-semibold">
              {current.title}
            </p>
          </button>
        </div>

        {/* Pagination — only when there are multiple unread items */}
        {hasMultiple && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={prev}
              aria-label="Previous announcement"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="text-muted-foreground min-w-[2.5rem] text-center text-xs tabular-nums">
              {safeIndex + 1} / {total}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={next}
              aria-label="Next announcement"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Dismiss */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <AnnouncementDetailModal
        announcement={selected}
        readIds={readIds}
        onMarkRead={handleMarkRead}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
