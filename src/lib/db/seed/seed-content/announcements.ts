import { ADMIN_USER_NAMES } from "./users"

// ---------------------------------------------------------------------------
// Deterministic: Announcements (6)
// ---------------------------------------------------------------------------
export interface AnnouncementSeedEntry {
  id: string
  title: string
  content: string
  publishedAt: string
  expiresAt: string | null
  isActive: boolean
  targetRoles: string[]
  createdBy: string
}

const ANNOUNCEMENT_TITLES = [
  "System maintenance scheduled",
  "New pickup zones active",
  "Updated delivery rates",
  "Holiday schedule announcement",
  "Platform feature update",
  "Q3 performance bonus",
] as const

const ANNOUNCEMENT_CONTENTS = [
  "The platform will be undergoing scheduled maintenance on July 20th from 2:00 AM to 4:00 AM. During this time, some services may be temporarily unavailable.",
  "We have expanded our pickup zone coverage to include all major districts. Riders can now collect parcels from any active pickup location in their assigned zone.",
  "Delivery rates have been updated effective August 1st. Please review the new rate card on the pricing page for details.",
  "Our offices will remain closed on August 15th for national holiday. Please plan your dispatch and delivery schedules accordingly.",
  "We've added bulk rider assignment, date range filtering, and CSV export to the dispatch page. Check the changelog for the full list.",
  "Top-performing riders and warehouses this quarter will receive a performance bonus. Details will be shared via email.",
]

const ANNOUNCEMENT_TARGET_ROLES: string[][] = [
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"],
  ["MERCHANT", "RIDER"],
  ["MERCHANT"],
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"],
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN"],
  ["WAREHOUSE_ADMIN", "RIDER"],
]

export const SEED_ANNOUNCEMENTS: AnnouncementSeedEntry[] = Array.from(
  { length: 6 },
  (_, i) => ({
    id: `ANN-${String(100001 + i).padStart(6, "0")}E`,
    title: ANNOUNCEMENT_TITLES[i],
    content: ANNOUNCEMENT_CONTENTS[i],
    publishedAt: new Date(Date.now() - (i + 1) * 5 * 86400000).toISOString(),
    expiresAt:
      i === 0 ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
    isActive: i < 5,
    targetRoles: ANNOUNCEMENT_TARGET_ROLES[i],
    createdBy: i < 2 ? ADMIN_USER_NAMES.nadia : ADMIN_USER_NAMES.tanvir,
  }),
)
