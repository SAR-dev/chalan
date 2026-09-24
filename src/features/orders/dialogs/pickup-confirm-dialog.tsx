"use client"

import {
  ExternalLink,
  MapPin,
  Package,
  PackageCheck,
  Store,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { ImageGalleryUpload } from "@/components/image-upload"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import type { Order, PickupLocation } from "@/lib/types"

export function PickupConfirmDialog({
  order,
  merchantName,
  pickupLocation,
  open,
  onOpenChange,
}: {
  order: Order | null
  merchantName: string
  pickupLocation: PickupLocation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { markOrderPickedUp } = useOrders()
  const [submitting, setSubmitting] = useState(false)
  const [proofUrls, setProofUrls] = useState<string[]>([])

  if (!order) return null

  const pickupLabel = pickupLocation?.label ?? "—"
  const pickupAddress = pickupLocation?.address ?? "—"
  const mapLink = pickupLocation?.mapLink?.trim() || null

  function handleOpenChange(next: boolean) {
    if (!next) setProofUrls([])
    onOpenChange(next)
  }

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const result = await markOrderPickedUp(order!.id, proofUrls)
      if (result.ok) {
        toast.success(`${order!.id} marked as picked up.`)
        handleOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to update pickup.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Confirm pickup of ${order.id}`}
      description="Collect the parcel from the merchant, then confirm to update the status to Picked up. The merchant sees this change in real time."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Updating"
      submitDisabled={proofUrls.length === 0}
      submitLabel="Confirm pickup"
      submitIcon={<PackageCheck className="size-4" />}
    >
      <div className="grid grid-cols-1 gap-4 pt-2 pb-4">
        <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
          <InfoRow icon={Store} label="Merchant" value={merchantName} />
          <InfoRow
            icon={MapPin}
            label="Pickup location"
            value={`${pickupLabel} — ${pickupAddress}`}
          />

          {mapLink ? (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary ml-7 inline-flex w-fit items-center gap-1.5 text-sm hover:underline"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              Open in maps
            </a>
          ) : null}

          <Separator className="my-1" />
          <InfoRow
            icon={Package}
            label="Parcel"
            value={`${order.parcelWeightKg} KG · ${order.deliveryType}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Capture photos of the parcel as proof you collected it from the
            merchant.
          </p>
          <Label>
            Pickup proof photos <span className="text-destructive">*</span>
          </Label>
          <ImageGalleryUpload
            value={proofUrls}
            onChange={setProofUrls}
            folder="pickups"
          />
        </div>
      </div>
    </FormDialog>
  )
}
