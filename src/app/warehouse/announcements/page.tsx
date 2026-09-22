"use client"

import { pageContent } from "@/config/content"
import { AnnouncementsInbox } from "@/features/announcements/components/announcements-inbox"

export default function WarehouseAnnouncementsPage() {
  return (
    <AnnouncementsInbox
      title={pageContent.warehouse.announcements.title}
      description={pageContent.warehouse.announcements.description}
    />
  )
}
