"use client"

import { Package, Wallet } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { usePayouts } from "@/features/payouts/hooks/use-payouts"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"
import { PAYOUT_METHODS } from "./const"

export function PayoutRequestDialog({
  payableOrders,
  payableTotal,
  payableAmount,
  open,
  onOpenChange,
}: {
  payableOrders: Order[]
  payableTotal: number
  payableAmount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { requestPayout } = usePayouts()
  const [method, setMethod] = useState("bKash")
  const [details, setDetails] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const prevOpen = useRef(open)
  useEffect(() => {
    if (open && !prevOpen.current) setOpenCount((c) => c + 1)
    prevOpen.current = open
  }, [open])

  const total = payableAmount
  const detailsLabel =
    method === "Bank transfer" ? "Bank account details" : `${method} number`

  async function handleSubmit() {
    if (!details.trim()) {
      toast.error("Enter your payout account details.")
      return
    }
    setSubmitting(true)
    try {
      const result = await requestPayout({
        payoutMethod: method,
        payoutDetails: details,
      })
      if (result.ok) {
        toast.success(
          `Payout request ${result.request?.id} submitted for ${formatTk(total)}.`,
        )
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to submit payout request.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      key={`${payableTotal}-${payableAmount}-${openCount}`}
      open={open}
      onOpenChange={onOpenChange}
      title="Request payout"
      description="COD amount only from your delivered, settled orders. Platform fees are deducted from your balance separately."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Submitting"
      submitLabel="Submit request"
      submitIcon={<Wallet className="size-4" />}
      submitDisabled={payableTotal === 0}
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="border-border bg-muted/40 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Package className="size-4" />
              {payableTotal} order
              {payableTotal === 1 ? "" : "s"} included
            </span>
            <span className="text-muted-foreground text-sm">Payout amount</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-muted-foreground font-mono text-xs">
              {payableOrders.length > 0
                ? `Showing ${payableOrders.length} of ${payableTotal} payable orders`
                : "No payable orders on this page"}
            </p>
            <p className="text-primary text-2xl font-semibold tabular-nums">
              {formatTk(total)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payout-method">Payout method</Label>
            <Select
              value={method}
              onValueChange={(value) => setMethod(value ?? "bKash")}
            >
              <SelectTrigger id="payout-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payout-details">{detailsLabel}</Label>
            <Input
              id="payout-details"
              placeholder={
                method === "Bank transfer"
                  ? "Bank · A/C number"
                  : "+8801XXXXXXXXX"
              }
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
      </div>
    </FormDialog>
  )
}
