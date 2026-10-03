"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { mutate as globalMutate } from "swr"
import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import type { AnnouncementWithRead } from "@/lib/announcements"
import { formatDateTime } from "@/lib/format"

const ACTIVE_KEY = "/api/announcements/active"

/**
 * The announcement body plus the one-time mark-read. This is the shared,
 * role-agnostic chrome for /announcements/[id] — no sidebar, so the header is
 * just brand-adjacent navigation (back to the reader's own inbox).
 */
export function AnnouncementView({
  announcement,
  inboxHref,
}: {
  announcement: AnnouncementWithRead
  inboxHref: string
}) {
  // Mark read on mount when unread. A ref guards StrictMode's double effect
  // (dev runs effects twice) so the endpoint is not posted twice for one view.
  const postedRef = useRef(false)

  useEffect(() => {
    if (announcement.readAt || postedRef.current) return
    postedRef.current = true

    // Fire-and-forget: reading the page must not wait on, or fail with, the
    // write. The badge on the inbox/bell clears via the cache revalidation.
    fetch(`/api/announcements/${announcement.id}/read`, { method: "POST" })
      .then((res) => (res.ok ? globalMutate(ACTIVE_KEY) : undefined))
      .catch(() => {
        // A failed mark-read is invisible here (the page already shows the
        // content) — the next successful read attempt just posts again.
        postedRef.current = false
      })
  }, [announcement.readAt, announcement.id])

  return (
    <main
      id="main-content"
      className="bg-background text-foreground mx-auto w-full max-w-3xl px-6 py-8 font-sans antialiased"
    >
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={inboxHref} />}
        nativeButton={false}
        data-testid="announcement-back"
        className="mb-4 -ml-2.5"
      >
        <ArrowLeft className="size-4" />
        Back to inbox
      </Button>

      <PageHeader
        title={announcement.title}
        description={
          announcement.publishedAt
            ? `Published ${formatDateTime(announcement.publishedAt, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })} · Posted by ${announcement.createdBy}`
            : `Posted by ${announcement.createdBy}`
        }
      />

      <article data-testid="announcement-body">
        <Markdown content={announcement.content} />
      </article>
    </main>
  )
}
