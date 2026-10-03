import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getAnnouncementForUser } from "@/lib/announcements"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { loginRedirectPath } from "@/lib/login-redirect"
import { inboxPathForRole } from "@/lib/nav-config"
import { AnnouncementView } from "./announcement-view"

// Shared detail page for all four roles. It deliberately lives OUTSIDE the
// role segments (/dashboard, /merchant, …) so there is exactly one URL per
// announcement — shareable, back-button friendly, and no per-role duplicate.
// Auth and role targeting are enforced here server-side; the page renders its
// own chrome (AnnouncementView) instead of a role shell.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function AnnouncementDetailPage({ params }: Props) {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())

  const { id } = await params

  // Null covers both "no such id" and "targeted at another role" — a
  // guessed id must not leak that an announcement exists.
  const announcement = await getAnnouncementForUser(dbRead, {
    id,
    userId: me.userId,
    role: me.role,
  })
  if (!announcement) notFound()

  return (
    <AnnouncementView
      announcement={announcement}
      inboxHref={inboxPathForRole(me.role)}
    />
  )
}
