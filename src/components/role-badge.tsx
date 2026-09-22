import { StatusBadge } from "@/components/status-badge"
import { ROLE_LABELS, ROLE_TONES } from "@/lib/constants"
import type { Role } from "@/lib/types"

export function RoleBadge({ role }: { role: Role }) {
  return <StatusBadge label={ROLE_LABELS[role]} tone={ROLE_TONES[role]} />
}
