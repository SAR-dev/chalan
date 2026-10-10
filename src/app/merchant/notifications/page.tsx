"use client"

import { pageContent } from "@/config/content"
import { NotificationInbox } from "@/features/notifications/components/notification-inbox"

export default function MerchantNotificationsPage() {
  return (
    <NotificationInbox
      title={pageContent.merchant.notifications.title}
      description={pageContent.merchant.notifications.description}
    />
  )
}
