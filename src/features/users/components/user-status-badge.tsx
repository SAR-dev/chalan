import { StatusBadge } from "@/components/status-badge"
import {
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
  type UserAccountStatus,
} from "@/lib/constants"
import type { AdminUser } from "../hooks/use-users"

export function userAccountStatus(user: AdminUser): UserAccountStatus {
  if (user.banned) return "BANNED"
  if (user.isActive === false) return "INACTIVE"
  return "ACTIVE"
}

export function UserStatusBadge({ user }: { user: AdminUser }) {
  const status = userAccountStatus(user)
  return (
    <StatusBadge
      label={USER_STATUS_LABELS[status]}
      tone={USER_STATUS_TONES[status]}
    />
  )
}
