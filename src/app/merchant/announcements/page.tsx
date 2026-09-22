"use client"

import { pageContent } from "@/config/content"
import { AnnouncementsInbox } from "@/features/announcements/components/announcements-inbox"

export default function MerchantAnnouncementsPage() {
  return (
    <AnnouncementsInbox
      title={pageContent.merchant.announcements.title}
      description={pageContent.merchant.announcements.description}
    />
  )
}
