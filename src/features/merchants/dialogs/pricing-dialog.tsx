"use client"

import { Calculator } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { calcDeliveryCharge, formatTk } from "@/lib/pricing"
import type { Merchant } from "@/lib/types"

export function PricingDialog({
  merchant,
  open,
  onOpenChange,
}: {
  merchant: Merchant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { setMerchantPricing } = useMerchants()
  const [submitting, setSubmitting] = useState(false)
  const [baseRate, setBaseRate] = useState("0")
  const [extraRatePerKg, setExtraRatePerKg] = useState("15")
  const [freeWeightKg, setFreeWeightKg] = useState("1")
  const [maxWeightKg, setMaxWeightKg] = useState("3")
  const [previewWeight, setPreviewWeight] = useState("2")
  // Track which merchant the form is currently synced to.
  const [syncedId, setSyncedId] = useState<string | null>(null)

  // Sync form fields when a new merchant is opened.
  if (merchant && merchant.id !== syncedId) {
    setSyncedId(merchant.id)
    setBaseRate(String(merchant.baseRate))
    setExtraRatePerKg(String(merchant.extraRatePerKg))
    setFreeWeightKg(String(merchant.freeWeightKg))
    setMaxWeightKg(String(merchant.maxWeightKg))
    setPreviewWeight(String(merchant.maxWeightKg))
  }

  if (!merchant) return null

  const pricing = {
    baseRate: Number(baseRate) || 0,
    extraRatePerKg: Number(extraRatePerKg) || 0,
    freeWeightKg: Number(freeWeightKg) || 0,
    maxWeightKg: Number(maxWeightKg) || 0,
  }
  const weight = Number(previewWeight) || 0
  const breakdown = calcDeliveryCharge(pricing, weight)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (pricing.baseRate <= 0) {
      toast.error("Base rate must be greater than 0.")
      return
    }
    setSubmitting(true)
    setMerchantPricing(merchant!.id, pricing)
    toast.success(`Pricing updated for ${merchant!.businessName}.`)
    setSubmitting(false)
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Set delivery pricing"
      description={
        <>
          Assign rates for{" "}
          <span className="text-foreground font-medium">
            {merchant.businessName}
          </span>
          . The merchant&apos;s live calculator reflects these instantly.
        </>
      }
      onSubmit={handleSave}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save pricing"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="baseRate">Base rate (TK)</Label>
          <Input
            id="baseRate"
            type="number"
            min="0"
            step="1"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="extraRate">Extra per KG (TK)</Label>
          <Input
            id="extraRate"
            type="number"
            min="0"
            step="1"
            value={extraRatePerKg}
            onChange={(e) => setExtraRatePerKg(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="freeWeight">Free weight (KG)</Label>
          <Input
            id="freeWeight"
            type="number"
            min="0"
            step="0.5"
            value={freeWeightKg}
            onChange={(e) => setFreeWeightKg(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="maxWeight">Max weight (KG)</Label>
          <Input
            id="maxWeight"
            type="number"
            min="0"
            step="0.5"
            value={maxWeightKg}
            onChange={(e) => setMaxWeightKg(e.target.value)}
          />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Live calculator */}
      <div className="border-border bg-muted/40 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calculator className="text-primary size-4" />
          Live charge preview
        </div>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Label
              htmlFor="previewWeight"
              className="text-muted-foreground text-xs"
            >
              Sample parcel weight (KG)
            </Label>
            <Input
              id="previewWeight"
              type="number"
              min="0"
              step="0.1"
              value={previewWeight}
              onChange={(e) => setPreviewWeight(e.target.value)}
            />
          </div>
        </div>

        {breakdown.exceedsMax ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
            Parcel exceeds the {pricing.maxWeightKg} KG maximum — this order
            would be rejected.
          </p>
        ) : (
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Base ({pricing.freeWeightKg} KG included)
              </dt>
              <dd className="tabular-nums">{formatTk(breakdown.baseRate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Extra weight ({breakdown.billableExtraKg} KG &times;{" "}
                {formatTk(pricing.extraRatePerKg)})
              </dt>
              <dd className="tabular-nums">
                {formatTk(breakdown.extraWeightCharge)}
              </dd>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <dt>Delivery charge</dt>
              <dd className="text-primary tabular-nums">
                {formatTk(breakdown.total)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </FormDialog>
  )
}
