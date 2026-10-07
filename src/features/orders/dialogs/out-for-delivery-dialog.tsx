"use client"

import { MapPin, Navigation, Phone, User } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { ScanGate } from "@/features/orders/components/scan-gate"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useScanPolicy } from "@/features/platform-config/hooks/use-scan-policy"
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
  const { warehouseScanRequired } = useScanPolicy()
  const [submitting, setSubmitting] = useState(false)
  const [syncedId, setSyncedId] = useState<string | null>(null)
  // R9: parcel-label verification lives with the order-change re-sync, so a
  // different order can never inherit a scan from the previous one.
  const [verified, setVerified] = useState(false)

  if (order && order.id !== syncedId) {
    setSyncedId(order.id)
    setVerified(false)
  }

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
      description="Confirm you have picked up the parcel from the warehouse and are heading out now. This updates the status to Out for delivery."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Updating"
      submitDisabled={warehouseScanRequired && !verified}
      submitLabel="Confirm, out for delivery"
      submitTestId="out-for-delivery-submit"
      submitIcon={<Navigation className="size-4" />}
    >
      <div className="grid grid-cols-1 gap-4">
        {warehouseScanRequired ? (
          <ScanGate
            orderId={order.id}
            verified={verified}
            onVerify={() => setVerified(true)}
          />
        ) : null}

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
      </div>
    </FormDialog>
  )
}
