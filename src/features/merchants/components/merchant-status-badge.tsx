import { StatusBadge } from "@/components/status-badge"
import { MERCHANT_STATUS_LABELS, MERCHANT_STATUS_TONES } from "@/lib/constants"
import type { MerchantStatus } from "@/lib/types"

export function MerchantStatusBadge({ status }: { status: MerchantStatus }) {
  return (
    <StatusBadge
      label={MERCHANT_STATUS_LABELS[status]}
      tone={MERCHANT_STATUS_TONES[status]}
    />
  )
}
