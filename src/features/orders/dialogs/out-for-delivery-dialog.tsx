"use client"

import { MapPin, Navigation, Phone, User } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { toast } from "@/lib/notify"
import type { Order } from "@/lib/types"

export function OutForDeliveryDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { markOutForDelivery } = useOrders()
  const [submitting, setSubmitting] = useState(false)

  if (!order) return null

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const result = await markOutForDelivery(order!.id)
      if (result.ok) {
        toast.success(`${order!.id} is now out for delivery.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to start delivery.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Start delivery for ${order.id}`}
      description="Confirm you have the parcel with you and are heading out now. This updates the status to Out for delivery."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Updating"
      submitLabel="Confirm, out for delivery"
      submitIcon={<Navigation className="size-4" />}
    >
      <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <InfoRow icon={User} label="Recipient" value={order.recipientName} />
        <InfoRow icon={Phone} label="Phone" value={order.recipientPhone} />
        <Separator className="my-1" />
        <InfoRow
          icon={MapPin}
          label="Destination"
          value={
            <>
              {order.deliveryCity}
              <span className="block">{order.deliveryAddress}</span>
            </>
          }
        />
      </div>
    </FormDialog>
  )
}
