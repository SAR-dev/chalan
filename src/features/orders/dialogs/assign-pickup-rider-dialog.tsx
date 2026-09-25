"use client"

import { Bike, MapPin, Package, Phone, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { canPickup, useRiders } from "@/features/riders/hooks/use-riders"
import type { Order } from "@/lib/types"

export function AssignPickupRiderDialog({
  order,
  warehouseName,
  open,
  onOpenChange,
}: {
  order: Order | null
  warehouseName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { assignPickupRider } = useOrders()
  const { riders } = useRiders()
  const [riderId, setRiderId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const pickupRiders = riders.filter((r) => r.isActive && canPickup(r))
  const selectedRider = pickupRiders.find((r) => r.id === riderId)

  if (!order) return null

  const o = order

  async function handleConfirm() {
    if (!riderId) {
      toast.error("Select a pickup rider first.")
      return
    }
    setSubmitting(true)
    try {
      const result = await assignPickupRider(o.id, riderId)
      if (result.ok) {
        const rider = pickupRiders.find((r) => r.id === riderId)
        toast.success(
          `${o.id} assigned to ${rider?.name ?? "rider"} for pickup.`,
        )
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to assign pickup rider.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign pickup rider for ${order.id}`}
      description={`Select a rider from ${warehouseName} to collect this parcel from the merchant.`}
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Assigning"
      submitLabel="Assign rider"
      submitIcon={<ShieldCheck className="size-4" />}
      submitDisabled={pickupRiders.length === 0}
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
          <InfoRow
            icon={Package}
            label="Parcel"
            value={`${order.parcelWeightKg} KG · ${order.deliveryType}`}
          />
          <InfoRow
            icon={Phone}
            label="Recipient"
            value={`${order.recipientName} · ${order.recipientPhone}`}
          />
          <InfoRow
            icon={MapPin}
            label="Delivery address"
            value={
              <>
                {order.deliveryCity}
                <span className="block">{order.deliveryAddress}</span>
              </>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pickup-rider">Pickup rider</Label>
          {pickupRiders.length === 0 ? (
            <p className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
              No active pickup riders available.
            </p>
          ) : (
            <Select value={riderId} onValueChange={(v) => setRiderId(v ?? "")}>
              <SelectTrigger id="pickup-rider" className="w-full">
                <SelectValue placeholder="Select a pickup rider">
                  {selectedRider
                    ? `${selectedRider.name} · ${selectedRider.zone}`
                    : ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pickupRiders.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {r.zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {riderId ? (
            <div className="border-border bg-muted/40 mt-1 flex flex-col gap-2 rounded-lg border p-3">
              <InfoRow
                icon={Bike}
                label="Assigned rider"
                value={`${selectedRider?.name} · ${selectedRider?.phone}`}
              />
            </div>
          ) : null}
        </div>
      </div>
    </FormDialog>
  )
}
