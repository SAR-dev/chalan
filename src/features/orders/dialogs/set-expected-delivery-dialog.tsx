"use client"

import { CalendarDays } from "lucide-react"
import { useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { toast } from "@/lib/notify"
import { businessDateString } from "@/lib/timezone"
import type { Order } from "@/lib/types"

/**
 * An admin or warehouse admin overriding the promised delivery date.
 *
 * The date is sent as a `YYYY-MM-DD` day, not an instant: the promise is a
 * calendar day ("by the 9th") and the server expands it to the end of that
 * Dhaka day — the same boundary `computeExpectedDeliveryAt` uses when quoting
 * from the zone matrix, so an override and a quote never sit on different
 * calendars.
 *
 * Read back with `businessDateString` rather than `slice(0, 10)`: the stored
 * instant is end-of-day *Dhaka*, and only that helper is guaranteed to name the
 * day the promise refers to.
 */
export function SetExpectedDeliveryDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { setExpectedDelivery } = useOrders()
  const [date, setDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Sync when the dialog opens rather than on mount: the parent keeps the
  // dialog mounted for whichever order is selected, so the initial value would
  // otherwise be from the first order ever clicked.
  useEffect(() => {
    if (open && order?.expectedDeliveryAt) {
      setDate(businessDateString(new Date(order.expectedDeliveryAt)))
    }
  }, [open, order?.expectedDeliveryAt])

  if (!order) return null

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const result = await setExpectedDelivery(order!.id, date)
      if (result.ok) {
        toast.success(`${order!.id} now expected by ${date}.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to set the delivery date.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delivery date for ${order.id}`}
      description="Sets the date this parcel is promised by. The original quote is kept in the order's history."
      onConfirm={handleConfirm}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save date"
      submitDisabled={!date}
      submitTestId="set-expected-delivery-confirm"
      submitIcon={<CalendarDays className="size-4" />}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="expected-delivery-date">Expected delivery date</Label>
        <Input
          id="expected-delivery-date"
          data-testid="expected-delivery-date"
          type="date"
          value={date}
          min={businessDateString(new Date(order.createdAt))}
          onChange={(e) => setDate(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Currently quoted as{" "}
          {order.expectedDeliveryDays !== null &&
          order.expectedDeliveryDays !== undefined
            ? `${order.expectedDeliveryDays} day${
                order.expectedDeliveryDays === 1 ? "" : "s"
              }`
            : "no estimate"}
          .
        </p>
      </div>
    </FormDialog>
  )
}
