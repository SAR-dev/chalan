"use client"

import { Package, Truck } from "lucide-react"
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
import type { Rider } from "@/lib/types"

export function BulkDispatchDialog({
  count,
  ids,
  deliveryRiders,
  warehouseName,
  open,
  onOpenChange,
  onComplete,
}: {
  count: number
  ids: string[]
  deliveryRiders: Rider[]
  warehouseName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}) {
  const { bulkDispatch } = useOrders()
  const [riderId, setRiderId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const selectedRider = deliveryRiders.find((r) => r.id === riderId)

  async function handleConfirm() {
    if (!riderId) {
      toast.error("Select a delivery rider first.")
      return
    }
    setSubmitting(true)
    const res = await bulkDispatch(ids, riderId)
    if (res.ok) {
      toast.success(
        `${ids.length} ${ids.length === 1 ? "parcel" : "parcels"} dispatched with ${selectedRider?.name ?? "rider"}.`,
      )
    } else {
      toast.error(res.error ?? "Could not dispatch parcels.")
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
      title={`Dispatch ${count} ${count === 1 ? "parcel" : "parcels"} for delivery`}
      description={`Assign a delivery rider from ${warehouseName}. All selected orders update to In transit.`}
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Dispatching"
      submitLabel={`Dispatch with ${selectedRider?.name ?? "rider"}`}
      submitIcon={<Truck className="size-4" />}
      submitDisabled={deliveryRiders.length === 0 || !riderId}
    >
      <div className="grid grid-cols-1 gap-4 pt-2 pb-4">
        <div className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border p-4">
          <Package className="text-muted-foreground size-5" />
          <p className="text-sm font-medium">
            {count} {count === 1 ? "order" : "orders"} to dispatch
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-delivery-rider">Delivery rider</Label>
          {deliveryRiders.length === 0 ? (
            <p className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
              No active delivery riders are based at this warehouse.
            </p>
          ) : (
            <Select value={riderId} onValueChange={(v) => setRiderId(v ?? "")}>
              <SelectTrigger id="bulk-delivery-rider" className="w-full">
                <SelectValue placeholder="Select a delivery rider">
                  {selectedRider
                    ? `${selectedRider.name} · ${selectedRider.zone}`
                    : ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {deliveryRiders.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {r.zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </FormDialog>
  )
}
