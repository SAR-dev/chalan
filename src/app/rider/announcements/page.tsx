"use client"

import { pageContent } from "@/config/content"
import { AnnouncementsInbox } from "@/features/announcements/components/announcements-inbox"

export default function RiderAnnouncementsPage() {
  return (
    <AnnouncementsInbox
      title={pageContent.rider.announcements.title}
      description={pageContent.rider.announcements.description}
    />
  )
}
