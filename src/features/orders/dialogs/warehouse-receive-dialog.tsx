"use client"

import {
  Bike,
  MapPin,
  Package,
  Phone,
  Warehouse as WarehouseIcon,
} from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { ScanGate } from "@/features/orders/components/scan-gate"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useScanPolicy } from "@/features/platform-config/hooks/use-scan-policy"
import { toast } from "@/lib/notify"
import type { Order } from "@/lib/types"

export function WarehouseReceiveDialog({
  order,
  merchantName,
  riderName,
  warehouseName,
  open,
  onOpenChange,
}: {
  order: Order | null
  merchantName: string
  riderName: string
  warehouseName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { receiveOrderAtWarehouse } = useOrders()
  const { warehouseReceiveScanRequired } = useScanPolicy()
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
      const result = await receiveOrderAtWarehouse(order!.id)
      if (result.ok) {
        toast.success(`${order!.id} received into ${warehouseName}.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to log parcel into warehouse.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Receive ${order.id} into warehouse`}
      description="Confirm the parcel has physically arrived and log it in. The order status updates to In warehouse and the rider's pickup duty ends."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Logging in"
      submitDisabled={warehouseReceiveScanRequired && !verified}
      submitLabel="Receive parcel"
      submitTestId="warehouse-receive-submit"
    >
      <div className="grid grid-cols-1 gap-4">
        {warehouseReceiveScanRequired ? (
          <ScanGate
            orderId={order.id}
            verified={verified}
            onVerify={() => setVerified(true)}
          />
        ) : null}

        {/* R9 two-step: while a scan is required the body is just the gate —
            the parcel details wait for the label to be verified. */}
        {!warehouseReceiveScanRequired || verified ? (
          <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
            <InfoRow
              icon={WarehouseIcon}
              label="Receiving warehouse"
              value={warehouseName}
            />
            <InfoRow icon={Bike} label="Delivered by rider" value={riderName} />
            <Separator className="my-1" />
            <InfoRow
              icon={Package}
              label="Parcel"
              value={`${order.parcelWeightKg} KG · ${order.deliveryType} · from ${merchantName}`}
            />
            <InfoRow
              icon={MapPin}
              label="Final destination"
              value={
                <>
                  {order.deliveryCity}
                  <span className="block">{order.deliveryAddress}</span>
                </>
              }
            />
            <InfoRow
              icon={Phone}
              label="Recipient"
              value={`${order.recipientName} · ${order.recipientPhone}`}
            />
          </div>
        ) : null}
      </div>
    </FormDialog>
  )
}
