import { redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { pageContent } from "@/config/content"
import { AnnouncementForm } from "@/features/announcements/components/announcement-form"
import { requireSession } from "@/lib/api-auth"
import { loginRedirectPath } from "@/lib/login-redirect"

// Create flow for announcements. Server-gated (the API is SUPER_ADMIN-only,
// so letting any other role render the form would only fail on submit) and
// rendered as a page rather than a dialog: the markdown body with Write /
// Preview needs the room, and a page is linkable and back-button friendly.
// Robots noindex comes from the dashboard layout.
export default async function NewAnnouncementPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.announcementsNew.title}
        description={pageContent.dashboard.announcementsNew.description}
      />
      <AnnouncementForm />
    </>
  )
}
