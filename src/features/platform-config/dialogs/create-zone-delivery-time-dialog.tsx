"use client"

import { useState } from "react"
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

/**
 * Sets (or overwrites — the endpoint upserts) one lane's delivery time.
 *
 * Two zone picks and a number, so no rate fields are offered here: pricing and
 * delivery time are separate tables with separate lifecycles, and coupling the
 * editors would mean saving a day-count rewrites a base rate.
 */
export function CreateZoneDeliveryTimeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { zones } = useDeliveryZones()
  const { upsertDeliveryTime } = useZoneDeliveryTime()
  const [fromZoneId, setFromZoneId] = useState("")
  const [toZoneId, setToZoneId] = useState("")
  const [deliveryDays, setDeliveryDays] = useState("2")
  const [submitting, setSubmitting] = useState(false)

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
      const result = await upsertDeliveryTime({
        fromZoneId,
        toZoneId,
        deliveryDays: days,
      })
      if (result.ok) {
        toast.success("Delivery time saved.")
        setFromZoneId("")
        setToZoneId("")
        setDeliveryDays("2")
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
      title="Set delivery time"
      description="Days from order creation to delivery for this lane. Existing orders keep the date they were quoted."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save"
      submitTestId="create-zone-delivery-time-submit"
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zdt-from">From zone</Label>
          <Select
            value={fromZoneId}
            onValueChange={(v) => setFromZoneId(v ?? "")}
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
          <Select value={toZoneId} onValueChange={(v) => setToZoneId(v ?? "")}>
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
