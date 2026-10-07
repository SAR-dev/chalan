"use client"

import {
  CheckCircle2,
  MapPin,
  Package,
  Phone,
  User,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { ImageUpload } from "@/components/image-upload"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

type Outcome = "DELIVERED" | "FAILED"

export function DeliveryAttemptDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { markDelivered, markDeliveryFailed } = useOrders()
  const [outcome, setOutcome] = useState<Outcome>("DELIVERED")
  const [note, setNote] = useState("")
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!order) return null

  function reset() {
    setOutcome("DELIVERED")
    setNote("")
    setProofUrl(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (outcome === "DELIVERED") {
        const result = await markDelivered(order!.id, proofUrl ?? undefined)
        if (result.ok) {
          toast.success(
            `${order!.id} delivered. ${formatTk(order!.productCost)} collected.`,
          )
          handleOpenChange(false)
        } else {
          toast.error(result.error ?? "Unable to mark delivered.")
        }
      } else {
        const result = await markDeliveryFailed(order!.id, note)
        if (result.ok) {
          toast.success(`${order!.id} marked as a failed attempt.`)
          handleOpenChange(false)
        } else {
          toast.error(result.error ?? "Unable to record failed attempt.")
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const failedNeedsNote = outcome === "FAILED" && !note.trim()
  const deliveredNeedsProof = outcome === "DELIVERED" && !proofUrl
  const submitBlocked = failedNeedsNote || deliveredNeedsProof

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Delivery attempt — ${order.id}`}
      description="Record the outcome of this delivery attempt. The merchant and admins see the result in real time."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitDisabled={submitBlocked}
      submitVariant={outcome === "FAILED" ? "destructive" : "default"}
      submitLabel={
        outcome === "DELIVERED" ? "Confirm delivery" : "Record failure"
      }
      submitIcon={
        outcome === "DELIVERED" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <XCircle className="size-4" />
        )
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
          <InfoRow icon={User} label="Recipient" value={order.recipientName} />
          <InfoRow icon={Phone} label="Phone" value={order.recipientPhone} />
          <InfoRow
            icon={MapPin}
            label="Deliver to"
            value={
              <>
                {order.deliveryCity}
                <span className="block">{order.deliveryAddress}</span>
              </>
            }
          />
          <Separator className="my-1" />
          <InfoRow
            icon={Package}
            label="Collect on delivery"
            value={formatTk(order.productCost)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOutcome("DELIVERED")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              outcome === "DELIVERED"
                ? "border-chart-2 bg-chart-2/10 text-chart-2"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <CheckCircle2 className="size-4" />
            Delivered
          </button>
          <button
            type="button"
            onClick={() => setOutcome("FAILED")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              outcome === "FAILED"
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <XCircle className="size-4" />
            Failed
          </button>
        </div>

        {outcome === "DELIVERED" ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Confirm you collected {formatTk(order.productCost)} from{" "}
              {order.recipientName.split(" ")[0]} and capture proof of delivery.
            </p>
            <Label>
              Proof of delivery photo{" "}
              <span className="text-destructive">*</span>
            </Label>
            <ImageUpload
              value={proofUrl}
              onChange={setProofUrl}
              folder="delivery-proofs"
              label="Capture / upload proof photo"
              className="h-28"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="failure-note">
              Reason for failed attempt{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="failure-note"
              placeholder="e.g. Recipient not available, phone switched off, wrong address…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
            <p className="text-muted-foreground text-xs">
              The parcel returns to the warehouse queue for the admin to
              process.
            </p>
          </div>
        )}
      </div>
    </FormDialog>
  )
}
