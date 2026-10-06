"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZoneDeliveryTime } from "@/features/platform-config/hooks/use-zone-delivery-time"
import type { ZoneDeliveryTime } from "@/lib/types"

/**
 * Sets (or overwrites — the endpoint upserts) one lane's delivery time.
 *
 * Two zone picks and a number, so no rate fields are offered here: pricing and
 * delivery time are separate tables with separate lifecycles, and coupling the
 * editors would mean saving a day-count rewrites a base rate.
 *
 * With an `editing` row the same form becomes the in-place editor: the zone
 * pair is the lane's identity (the unique index on (fromZoneId, toZoneId)), so
 * it is locked while the day count is patched by id.
 */
export function CreateZoneDeliveryTimeDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: ZoneDeliveryTime | null
}) {
  const { zones } = useDeliveryZones()
  const { upsertDeliveryTime, updateDeliveryTime } = useZoneDeliveryTime()
  const [fromZoneId, setFromZoneId] = useState("")
  const [toZoneId, setToZoneId] = useState("")
  const [deliveryDays, setDeliveryDays] = useState("2")
  const [submitting, setSubmitting] = useState(false)

  // Prefill whenever the dialog opens for a different row (or a fresh create).
  // The keyed `useEffect` guards against stale state lingering from a previous
  // edit: without it, opening a second row would show the first row's pair.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setFromZoneId(editing.fromZoneId)
      setToZoneId(editing.toZoneId)
      setDeliveryDays(String(editing.deliveryDays))
    } else {
      setFromZoneId("")
      setToZoneId("")
      setDeliveryDays("2")
    }
  }, [open, editing])

  async function handleSubmit() {
    if (!fromZoneId) {
      toast.error("From zone is required.")
      return
    }
    if (!toZoneId) {
      toast.error("To zone is required.")
      return
    }
    const days = Number(deliveryDays)
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast.error("Delivery days must be a whole number between 0 and 365.")
      return
    }
    setSubmitting(true)
    try {
      const result = editing
        ? await updateDeliveryTime(editing.id, days)
        : await upsertDeliveryTime({
            fromZoneId,
            toZoneId,
            deliveryDays: days,
          })
      if (result.ok) {
        toast.success(
          editing ? "Delivery time updated." : "Delivery time saved.",
        )
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not save delivery time.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit delivery time" : "Set delivery time"}
      description={
        editing
          ? "Change how many days this lane takes. Existing orders keep the date they were quoted."
          : "Days from order creation to delivery for this lane. Existing orders keep the date they were quoted."
      }
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel={editing ? "Save changes" : "Save"}
      submitTestId="create-zone-delivery-time-submit"
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zdt-from">From zone</Label>
          <Select
            value={fromZoneId}
            onValueChange={(v) => setFromZoneId(v ?? "")}
            disabled={Boolean(editing)}
          >
            <SelectTrigger id="zdt-from" data-testid="zone-delivery-time-from">
              <SelectValue placeholder="Origin zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem
                  key={z.id}
                  value={z.id}
                  data-testid={`zdt-from-${z.id}`}
                >
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zdt-to">To zone</Label>
          <Select
            value={toZoneId}
            onValueChange={(v) => setToZoneId(v ?? "")}
            disabled={Boolean(editing)}
          >
            <SelectTrigger id="zdt-to" data-testid="zone-delivery-time-to">
              <SelectValue placeholder="Destination zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem
                  key={z.id}
                  value={z.id}
                  data-testid={`zdt-to-${z.id}`}
                >
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zdt-days">Delivery days</Label>
          <Input
            id="zdt-days"
            data-testid="zone-delivery-time-days"
            type="number"
            min={0}
            max={365}
            step={1}
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            0 means same-day. An unconfigured lane shows no estimate rather than
            blocking an order.
          </p>
        </div>
      </div>
    </FormDialog>
  )
}
