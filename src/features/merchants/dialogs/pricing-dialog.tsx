"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import type { Merchant } from "@/lib/types"

/**
 * Sets a merchant's max parcel weight. Delivery, COD and cancellation fees are
 * owned by zone pricing (platform defaults as the fallback), so there are no
 * per-merchant rates to edit here.
 */
export function PricingDialog({
  merchant,
  open,
  onOpenChange,
}: {
  merchant: Merchant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { setMerchantWeightLimit } = useMerchants()
  const [submitting, setSubmitting] = useState(false)
  const [maxWeightKg, setMaxWeightKg] = useState("3")
  // Track which merchant the form is currently synced to.
  const [syncedId, setSyncedId] = useState<string | null>(null)

  // Sync form fields when a new merchant is opened.
  if (merchant && merchant.id !== syncedId) {
    setSyncedId(merchant.id)
    setMaxWeightKg(String(merchant.maxWeightKg))
  }

  if (!merchant) return null

  const weight = Number(maxWeightKg) || 0

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (weight <= 0) {
      toast.error("Max weight must be greater than 0.")
      return
    }
    setSubmitting(true)
    setMerchantWeightLimit(merchant!.id, { maxWeightKg: weight })
    toast.success(`Weight limit updated for ${merchant!.businessName}.`)
    setSubmitting(false)
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set weight limit"
      description={
        <>
          Set the maximum parcel weight for{" "}
          <span className="text-foreground font-medium">
            {merchant.businessName}
          </span>
          . Delivery and COD fees come from zone pricing.
        </>
      }
      onSubmit={handleSave}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save limit"
    >
      <div className="flex flex-col gap-2 py-2">
        <Label htmlFor="maxWeight">Max parcel weight (KG)</Label>
        <Input
          id="maxWeight"
          type="number"
          min="0.1"
          step="0.1"
          value={maxWeightKg}
          onChange={(e) => setMaxWeightKg(e.target.value)}
        />
      </div>
    </FormDialog>
  )
}
