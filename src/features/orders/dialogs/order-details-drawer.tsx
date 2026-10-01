"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { OrderDetailsBody } from "@/features/orders/dialogs/order-details-body"

export function OrderDetailsDrawer({
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="order-details-drawer"
        className="w-full max-w-xl bg-background text-foreground"
      >
        <SheetHeader className="border-border border-b pr-12">
          <SheetTitle>Order details</SheetTitle>
          <SheetDescription>
            Status, parcel contents and delivery history for this order.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <OrderDetailsBody
            orderCode={orderCode}
            open={open}
            detailsHref={detailsHref}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
