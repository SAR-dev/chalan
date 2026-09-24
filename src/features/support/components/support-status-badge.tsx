import { StatusBadge } from "@/components/status-badge"
import { SUPPORT_STATUS_LABELS, SUPPORT_STATUS_TONES } from "@/lib/constants"
import type { SupportStatus } from "@/lib/types"

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return (
    <StatusBadge
      label={SUPPORT_STATUS_LABELS[status] ?? status}
      tone={SUPPORT_STATUS_TONES[status] ?? "neutral"}
    />
  )
}
