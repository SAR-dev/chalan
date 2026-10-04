"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import type { Announcement } from "@/lib/types"

/**
 * The announcement body. This is the shared, role-agnostic chrome for
 * /announcements/[id] — no sidebar, so the header is just brand-adjacent
 * navigation back out of the page.
 *
 * Deliberately does NOT write anything on mount: viewing one announcement
 * must not advance the feed watermark (that would mark everything else as
 * seen too). Only visiting the feed stamps — see useAnnouncementFeed.
 */
export function AnnouncementView({
  announcement,
  inboxHref,
}: {
  announcement: Announcement
  inboxHref: string
}) {
  const router = useRouter()

  function goBack() {
    // "Go back" = one entry in this tab's history: the feed if we came from
    // it, the bell, a share chat — whatever actually led here. A directly
    // opened tab (typed URL, fresh link) has no previous entry, so fall back
    // to the reader's feed rather than leaving a dead button.
    if (window.history.length > 1) router.back()
    else router.push(inboxHref)
  }

  return (
    <main
      id="main-content"
      className="bg-background text-foreground mx-auto w-full max-w-3xl px-6 py-8 font-sans antialiased"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={goBack}
        data-testid="announcement-back"
        className="mb-4 -ml-2.5"
      >
        <ArrowLeft className="size-4" />
        Go back
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
