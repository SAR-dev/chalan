"use client"

import { MapPin, Navigation, Package, Weight } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

/**
 * The rider declaring they are heading to the shop.
 *
 * Mirrors `OutForDeliveryDialog` — same confirmation step, same "this changes
 * the status" wording — because the two are the same commitment at opposite
 * ends of the parcel's life. What is shown differs: the delivery dialog names
 * the recipient because that is who is waiting, while this one names the
 * pickup location because that is where the rider is going.
 *
 * The step is not cosmetic. `picked-up` is gated on `OUT_FOR_PICKUP`, so
 * skipping this leaves the rider unable to collect — the confirmation exists to
 * make that gate visible before it is hit.
 */
export function OutForPickupDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { markOutForPickup } = useOrders()
  const { pickupLocations } = usePickupLocations()
  const [submitting, setSubmitting] = useState(false)

  if (!order) return null

  const pickupLocation = pickupLocations.find(
    (p) => p.id === order.pickupLocationId,
  )

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const result = await markOutForPickup(order!.id)
      if (result.ok) {
        toast.success(`${order!.id} is now out for pickup.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to start pickup.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Start pickup for ${order.id}`}
      description="Confirm you are heading to the shop now. This updates the status to Out for pickup, and you can collect the parcel once it does."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Updating"
      submitLabel="Confirm, out for pickup"
      submitTestId="out-for-pickup-confirm"
      submitIcon={<Navigation className="size-4" />}
    >
      <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <InfoRow
          icon={MapPin}
          label="Pickup location"
          value={
            pickupLocation ? (
              <>
                {pickupLocation.label}
                <span className="block">{pickupLocation.address}</span>
              </>
            ) : (
              "Loading…"
            )
          }
        />
        <Separator className="my-1" />
        <InfoRow
          icon={Weight}
          label="Weight"
          value={`${order.parcelWeightKg} kg`}
        />
        <InfoRow
          icon={Package}
          label="Item cost"
          value={formatTk(Number(order.productCost ?? 0))}
        />
      </div>
    </FormDialog>
  )
}
