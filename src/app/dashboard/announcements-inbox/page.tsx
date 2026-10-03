import { redirect } from "next/navigation"
import { pageContent } from "@/config/content"
import { getActiveAnnouncements } from "@/lib/announcements"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { loginRedirectPath } from "@/lib/login-redirect"
import { AnnouncementsInboxClient } from "./inbox-client"

export default async function DashboardAnnouncementsInboxPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())

  // Same helper as GET /api/announcements/active, so the server-rendered
  // first paint already carries `readAt` — no flash of "unread" before the
  // client hook revalidates.
  const forMe = await getActiveAnnouncements(dbRead, {
    userId: me.userId,
    role: me.role,
  })

  return (
    <AnnouncementsInboxClient
      title={pageContent.dashboard.announcementsInbox.title}
      description={pageContent.dashboard.announcementsInbox.description}
      initialAnnouncements={forMe}
    />
  )
}
