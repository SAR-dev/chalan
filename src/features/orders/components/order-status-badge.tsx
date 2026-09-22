import { StatusBadge } from "@/components/status-badge"
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/constants"
import type { OrderStatus } from "@/lib/types"

export function OrderStatusBadge({
  status,
  size,
}: {
  status: OrderStatus
  size?: "sm" | "md"
}) {
  return (
    <StatusBadge
      label={ORDER_STATUS_LABELS[status]}
      tone={ORDER_STATUS_TONES[status]}
      size={size}
    />
  )
}
