"use client"

import { Ban, MapPin, Package, Phone, User } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { cancelOrder } = useOrders()
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const prevOpen = useRef(open)
  useEffect(() => {
    if (open && !prevOpen.current) setOpenCount((c) => c + 1)
    prevOpen.current = open
  }, [open])

  if (!order) return null

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await cancelOrder(order!.id, reason.trim() || undefined)
      if (result.ok) {
        toast.success(`${order!.id} has been cancelled.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to cancel order.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      key={`${order.id}-${openCount}`}
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel order — ${order.id}`}
      description="This action is irreversible. The order will be permanently closed and cannot be reactivated."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Cancelling"
      submitVariant="destructive"
      submitLabel="Cancel order"
      submitIcon={<Ban className="size-4" />}
      submitTestId="cancel-order-submit"
    >
      <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <InfoRow icon={User} label="Recipient" value={order.recipientName} />
        <InfoRow icon={Phone} label="Phone" value={order.recipientPhone} />
        <InfoRow
          icon={MapPin}
          label="Deliver to"
          value={
            <>
              {order.deliveryCity}
              <span className="block">{order.deliveryAddress}</span>
            </>
          }
        />
        <Separator className="my-1" />
        <InfoRow
          icon={Package}
          label="COD amount"
          value={formatTk(order.productCost)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cancel-reason">
          Reason for cancellation{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="cancel-reason"
          data-testid="cancel-reason-input"
          placeholder="e.g. Customer requested cancellation, duplicate order…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={100}
          rows={3}
        />
        <p className="text-muted-foreground text-xs">
          {reason.length}/100 characters
        </p>
      </div>
    </FormDialog>
  )
}
