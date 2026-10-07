"use client"

import {
  ExternalLink,
  MapPin,
  Package,
  PackageCheck,
  Store,
} from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { ImageGalleryUpload } from "@/components/image-upload"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { InfoRow } from "@/features/orders/components/info-row"
import { ScanGate } from "@/features/orders/components/scan-gate"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useScanPolicy } from "@/features/platform-config/hooks/use-scan-policy"
import { toast } from "@/lib/notify"
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
  const { pickupScanRequired } = useScanPolicy()
  const [submitting, setSubmitting] = useState(false)
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [weight, setWeight] = useState("")
  const [syncedId, setSyncedId] = useState<string | null>(null)
  // R9: parcel-label verification lives with the order-change re-sync, so a
  // different order can never inherit a scan from the previous one.
  const [verified, setVerified] = useState(false)

  if (order && order.id !== syncedId) {
    setSyncedId(order.id)
    setWeight(String(order.parcelWeightKg))
    setVerified(false)
  }

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
      const parsed = Number(weight)
      const parcelWeightKg =
        Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
      const result = await markOrderPickedUp(
        order!.id,
        proofUrls,
        parcelWeightKg,
      )
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
      submitDisabled={
        proofUrls.length === 0 || (pickupScanRequired && !verified)
      }
      submitLabel="Confirm pickup"
      submitIcon={<PackageCheck className="size-4" />}
    >
      <div className="grid grid-cols-1 gap-4">
        {pickupScanRequired ? (
          <ScanGate
            orderId={order.id}
            verified={verified}
            onVerify={() => setVerified(true)}
          />
        ) : null}

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
          <Label htmlFor="pickup-weight">Actual parcel weight (KG)</Label>
          <p className="text-muted-foreground text-xs">
            Correct this if it differs from the declared {order.parcelWeightKg}{" "}
            KG — the delivery fee is recalculated.
          </p>
          <Input
            id="pickup-weight"
            type="number"
            min="0.1"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
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
