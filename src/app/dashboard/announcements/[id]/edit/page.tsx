import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { pageContent } from "@/config/content"
import { AnnouncementForm } from "@/features/announcements/components/announcement-form"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"

// Edit flow for announcements — same gate and form as /new, plus an id lookup.
// Missing id → 404 (no existence leak beyond what the id space already gives;
// the manage list is SUPER_ADMIN-only anyway). Robots noindex comes from the
// dashboard layout.
export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  const { id } = await params
  const [row] = await dbRead
    .select()
    .from(announcement)
    .where(eq(announcement.id, id))
    .limit(1)
  if (!row) notFound()

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.announcementsEdit.title}
        description={pageContent.dashboard.announcementsEdit.description}
      />
      <AnnouncementForm announcement={row} />
    </>
  )
}
