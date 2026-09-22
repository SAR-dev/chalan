"use client"

import { Bike, Package } from "lucide-react"
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
import { useOrders } from "@/features/orders/hooks/use-orders"
import { canPickup, useRiders } from "@/features/riders/hooks/use-riders"

export function BulkAssignPickupRiderDialog({
  count,
  ids,
  open,
  onOpenChange,
  onComplete,
}: {
  count: number
  ids: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}) {
  const { bulkAssignPickupRider } = useOrders()
  const { riders } = useRiders()
  const [riderId, setRiderId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const pickupRiders = riders.filter((r) => r.isActive && canPickup(r))
  const selectedRider = pickupRiders.find((r) => r.id === riderId)

  async function handleConfirm() {
    if (!riderId) {
      toast.error("Select a pickup rider first.")
      return
    }
    setSubmitting(true)
    const res = await bulkAssignPickupRider(ids, riderId)
    if (res.ok) {
      toast.success(
        `${ids.length} ${ids.length === 1 ? "order" : "orders"} assigned to ${selectedRider?.name ?? "rider"} for pickup.`,
      )
    } else {
      toast.error(res.error ?? "Could not assign pickup rider.")
    }
    setSubmitting(false)
    onComplete()
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setRiderId("")
        onOpenChange(v)
      }}
      title={`Assign pickup rider to ${count} ${count === 1 ? "order" : "orders"}`}
      description="Select a rider to collect all selected parcels from their merchants."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Assigning"
      submitLabel={`Assign to ${selectedRider?.name ?? "rider"}`}
      submitIcon={<Bike className="size-4" />}
      submitDisabled={pickupRiders.length === 0 || !riderId}
    >
      <div className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border p-4">
        <Package className="text-muted-foreground size-5" />
        <p className="text-sm font-medium">
          {count} {count === 1 ? "order" : "orders"} to assign
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bulk-pickup-rider">Pickup rider</Label>
        {pickupRiders.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
            No active pickup riders available.
          </p>
        ) : (
          <Select value={riderId} onValueChange={(v) => setRiderId(v ?? "")}>
            <SelectTrigger id="bulk-pickup-rider" className="w-full">
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
      </div>
    </FormDialog>
  )
}
