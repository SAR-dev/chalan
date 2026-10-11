"use client"

import {
  AlertTriangle,
  Bike,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  Undo2,
  User,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { InfoRow } from "@/features/orders/components/info-row"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

type Decision = "REATTEMPT" | "RETURN"

export function FailedDeliveryDialog({
  order,
  merchantName,
  riderName,
  open,
  onOpenChange,
}: {
  order: Order | null
  merchantName: string
  riderName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { reattemptFailedOrder, returnFailedOrder } = useOrders()
  const [decision, setDecision] = useState<Decision>("REATTEMPT")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const prevOpen = useRef(open)
  useEffect(() => {
    if (open && !prevOpen.current) setOpenCount((c) => c + 1)
    prevOpen.current = open
  }, [open])

  if (!order) return null

  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (decision === "REATTEMPT") {
        const result = await reattemptFailedOrder(order!.id)
        if (result.ok) {
          toast.success(
            `${order!.id} sent back out for delivery with ${riderName}.`,
          )
          onOpenChange(false)
        } else {
          toast.error(result.error ?? "Unable to re-attempt delivery.")
        }
      } else {
        const result = await returnFailedOrder(order!.id, reason)
        if (result.ok) {
          toast.success(
            `${order!.id} closed as returned. No COD collected, no payout.`,
          )
          onOpenChange(false)
        } else {
          toast.error(result.error ?? "Unable to return parcel.")
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const returnNeedsReason = decision === "RETURN" && !reason.trim()

  return (
    <FormDialog
      key={`${order.id}-${openCount}`}
      open={open}
      onOpenChange={onOpenChange}
      title={`Resolve failed delivery — ${order.id}`}
      description="Decide whether to send this parcel back out for another attempt or close it as a return."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitDisabled={returnNeedsReason}
      submitVariant={decision === "RETURN" ? "destructive" : "default"}
      submitLabel={
        decision === "REATTEMPT" ? "Send back out" : "Confirm return"
      }
      submitIcon={
        decision === "REATTEMPT" ? (
          <RotateCcw className="size-4" />
        ) : (
          <Undo2 className="size-4" />
        )
      }
    >
      <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <InfoRow
          icon={Package}
          label="Parcel"
          value={`${order.parcelWeightKg} KG · ${order.deliveryType} · from ${merchantName}`}
        />
        <InfoRow icon={Bike} label="Delivery rider" value={riderName} />
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
      </div>

      {order.failureNote ? (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="leading-snug">
            <p className="font-medium">
              Attempt {order.deliveryAttempts ?? 1} failed
            </p>
            <p>{order.failureNote}</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDecision("REATTEMPT")}
          className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
            decision === "REATTEMPT"
              ? "border-chart-4 bg-chart-4/10 text-chart-4"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <RotateCcw className="size-4" />
          Re-attempt
        </button>
        <button
          type="button"
          onClick={() => setDecision("RETURN")}
          className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
            decision === "RETURN"
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <Undo2 className="size-4" />
          Return
        </button>
      </div>

      {decision === "REATTEMPT" ? (
        <p className="text-muted-foreground text-sm">
          The parcel goes back to {riderName} as{" "}
          <span className="text-foreground font-medium">Out for delivery</span>.
          They&apos;ll attempt to collect {formatTk(order.productCost)} again.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="return-reason">
            Reason for return <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="return-reason"
            placeholder="e.g. Recipient refused delivery, unreachable after repeated attempts…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-muted-foreground text-xs">
            The parcel is closed as Returned — no COD is collected and no
            merchant payout is issued.
          </p>
        </div>
      )}

      <Separator />
    </FormDialog>
  )
}
