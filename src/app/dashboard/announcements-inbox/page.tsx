import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { pageContent } from "@/config/content"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { AnnouncementsInboxClient } from "./inbox-client"

export default async function DashboardAnnouncementsInboxPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())

  const now = new Date().toISOString()

  const rows = await dbRead
    .select()
    .from(announcement)
    .where(
      and(
        eq(announcement.isActive, true),
        and(
          sql`${announcement.publishedAt} is not null`,
          lte(announcement.publishedAt, now),
        ),
        or(
          isNull(announcement.expiresAt),
          sql`${announcement.expiresAt} > ${now}`,
        ),
      ),
    )
    .orderBy(sql`${announcement.publishedAt} desc`)

  const forMe = rows.filter((a) =>
    (a.targetRoles as string[]).includes(me.role),
  )

  return (
    <AnnouncementsInboxClient
      title={pageContent.dashboard.announcementsInbox.title}
      description={pageContent.dashboard.announcementsInbox.description}
      initialAnnouncements={forMe}
    />
  )
}
