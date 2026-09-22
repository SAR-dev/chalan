"use client"

import { AlertTriangle, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

export function ApproveOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { approveOrder } = useOrders()
  const { merchants } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  const [submitting, setSubmitting] = useState(false)

  if (!order) return null

  const o = order
  const merchant = merchants.find((m) => m.id === o.merchantId)
  const pickup = pickupLocations.find((p) => p.id === o.pickupLocationId)
  const exceedsWeight = merchant
    ? o.parcelWeightKg > merchant.maxWeightKg
    : false

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await approveOrder(o.id)
      if (result.ok) {
        toast.success(`${o.id} approved.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to approve order.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Approve order ${order.id}`}
      description={
        <>
          Verify the parcel details below, then confirm approval. A warehouse
          admin will assign a pickup rider later.
        </>
      }
      onSubmit={handleApprove}
      submitting={submitting}
      submittingLabel="Approving"
      submitLabel="Approve order"
      submitIcon={<ShieldCheck className="size-4" />}
      submitDisabled={exceedsWeight}
    >
      {/* Order summary */}
      <dl className="border-border bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
        <DetailRow
          label="Recipient"
          value={`${order.recipientName} · ${order.recipientPhone}`}
        />
        <DetailRow
          label="Deliver to"
          value={
            <>
              {order.deliveryCity}
              <span className="block">{order.deliveryAddress}</span>
            </>
          }
        />
        <DetailRow
          label="Pickup from"
          value={pickup ? `${pickup.label}` : "—"}
        />
        <Separator className="my-1" />
        <DetailRow
          label="Parcel weight"
          value={`${order.parcelWeightKg} KG${
            merchant ? ` / ${merchant.maxWeightKg} KG max` : ""
          }`}
        />
        <DetailRow label="Delivery type" value={order.deliveryType} />
        <DetailRow label="COD amount" value={formatTk(order.productCost)} />
      </dl>

      {exceedsWeight ? (
        <p className="mt-2 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          Parcel exceeds the weight limit and cannot be approved.
        </p>
      ) : (
        <p className="mt-2 bg-chart-2/10 text-chart-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
          <ShieldCheck className="size-4 shrink-0" />
          Weight compliant — ready for approval.
        </p>
      )}
    </FormDialog>
  )
}
