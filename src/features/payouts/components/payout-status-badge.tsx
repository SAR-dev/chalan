import { StatusBadge } from "@/components/status-badge"
import { PAYOUT_STATUS_LABELS, PAYOUT_STATUS_TONES } from "@/lib/constants"
import type { PayoutRequestStatus } from "@/lib/types"

export function PayoutStatusBadge({ status }: { status: PayoutRequestStatus }) {
  return (
    <StatusBadge
      label={PAYOUT_STATUS_LABELS[status]}
      tone={PAYOUT_STATUS_TONES[status]}
    />
  )
}
