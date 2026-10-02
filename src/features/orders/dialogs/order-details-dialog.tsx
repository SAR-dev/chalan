"use client"

import {
  Dialog,
  DialogContent,
  DialogContentBody,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OrderDetailsBody } from "@/features/orders/dialogs/order-details-body"

export function OrderDetailsDialog({
  orderCode,
  open,
  onOpenChange,
  detailsHref,
}: {
  orderCode: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  detailsHref?: string
}) {
  if (!orderCode) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Order details</DialogTitle>
          {/* A title alone leaves focus landing on a name with no context —
              and no accessible description of what the dialog holds
              (ROADMAP R2.8). */}
          <DialogDescription>
            Status, parcel contents and delivery history for this order.
          </DialogDescription>
        </DialogHeader>

        <DialogContentBody>
          <OrderDetailsBody
            orderCode={orderCode}
            open={open}
            detailsHref={detailsHref}
          />
        </DialogContentBody>
      </DialogContent>
    </Dialog>
  )
}
