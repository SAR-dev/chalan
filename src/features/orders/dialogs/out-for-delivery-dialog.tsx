"use client"

import { MapPin, Navigation, Phone, User } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { useOrders } from "@/features/orders/hooks/use-orders"
import type { Order } from "@/lib/types"

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-sm leading-snug font-medium">{value}</p>
      </div>
    </div>
  )
}

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

  console.log("[B8] OutForDeliveryDialog render", { open, hasOrder: !!order })

  async function handleConfirm() {
    console.log("[B8] handleConfirm called")
    setSubmitting(true)
    try {
      console.log("[B8] calling markOutForDelivery")
      const result = await markOutForDelivery(order!.id)
      console.log("[B8] markOutForDelivery returned", result)
      if (result.ok) {
        console.log("[B8] result.ok is true, showing toast and closing dialog")
        toast.success(`${order!.id} is now out for delivery.`)
        console.log("[B8] calling onOpenChange(false)")
        onOpenChange(false)
        console.log("[B8] onOpenChange(false) returned")
      } else {
        console.log("[B8] result.ok is false, showing error toast")
        toast.error(result.error ?? "Unable to start delivery.")
      }
    } finally {
      console.log("[B8] finally block, setting submitting to false")
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
      <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4 mt-2 mb-4">
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
