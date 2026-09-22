import { BADGE_TONES } from "@/lib/constants"
import type { Announcement } from "@/lib/types"

function getAnnouncementStatus(a: Announcement): {
  label: string
  tone: keyof typeof BADGE_TONES
} {
  if (!a.isActive) return { label: "Inactive", tone: "neutral" }
  const now = new Date()
  if (!a.publishedAt) return { label: "Draft", tone: "pending" }
  if (new Date(a.publishedAt) > now) return { label: "Scheduled", tone: "info" }
  if (a.expiresAt && new Date(a.expiresAt) <= now)
    return { label: "Expired", tone: "neutral" }
  return { label: "Live", tone: "success" }
}

export function AnnouncementStatusBadge({
  announcement,
}: {
  announcement: Announcement
}) {
  const { label, tone } = getAnnouncementStatus(announcement)
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {label}
    </span>
  )
}
