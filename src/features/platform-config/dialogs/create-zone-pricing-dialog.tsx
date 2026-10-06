"use client"

import { useEffect, useState } from "react"
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
import { useZonePricing } from "@/features/platform-config/hooks/use-zone-pricing"
import type { ZonePricing } from "@/lib/types"

/**
 * Sets (or overwrites — the endpoint upserts) one lane's zone pricing.
 *
 * With an `editing` row the same form becomes the in-place editor: the zone
 * pair is the lane's identity (the unique index on (fromZoneId, toZoneId)), so
 * it is locked while the six rate fields are patched by id. Orders already
 * created on this lane keep their snapshot of the fee.
 */
export function CreateZonePricingDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: ZonePricing | null
}) {
  const { zones } = useDeliveryZones()
  const { upsertPricing, updatePricing } = useZonePricing()
  const [fromZoneId, setFromZoneId] = useState("")
  const [toZoneId, setToZoneId] = useState("")
  const [baseRate, setBaseRate] = useState("0")
  const [extraRatePerKg, setExtraRatePerKg] = useState("0")
  const [freeWeightKg, setFreeWeightKg] = useState("1")
  const [maxWeightKg, setMaxWeightKg] = useState("10")
  const [codFeePercentage, setCodFeePercentage] = useState("1")
  const [cancellationFee, setCancellationFee] = useState("0")
  const [submitting, setSubmitting] = useState(false)

  // Prefill whenever the dialog opens for a different row (or a fresh create).
  // The keyed `useEffect` guards against stale state lingering from a previous
  // edit: without it, opening a second row would show the first row's rates.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setFromZoneId(editing.fromZoneId)
      setToZoneId(editing.toZoneId)
      setBaseRate(String(editing.baseRate))
      setExtraRatePerKg(String(editing.extraRatePerKg))
      setFreeWeightKg(String(editing.freeWeightKg))
      setMaxWeightKg(String(editing.maxWeightKg))
      setCodFeePercentage(String(editing.codFeePercentage))
      setCancellationFee(String(editing.cancellationFee))
    } else {
      setFromZoneId("")
      setToZoneId("")
      setBaseRate("0")
      setExtraRatePerKg("0")
      setFreeWeightKg("1")
      setMaxWeightKg("10")
      setCodFeePercentage("1")
      setCancellationFee("0")
    }
  }, [open, editing])

  async function handleSubmit() {
    if (!fromZoneId) {
      toast.error("From zone is required.")
      return
    }
    if (!toZoneId) {
      toast.error("To zone is required.")
      return
    }
    setSubmitting(true)
    try {
      const input = {
        baseRate: Number(baseRate),
        extraRatePerKg: Number(extraRatePerKg),
        freeWeightKg: Number(freeWeightKg),
        maxWeightKg: Number(maxWeightKg),
        codFeePercentage: Number(codFeePercentage),
        cancellationFee: Number(cancellationFee),
      }
      const result = editing
        ? await updatePricing(editing.id, input)
        : await upsertPricing({ fromZoneId, toZoneId, ...input })
      if (result.ok) {
        toast.success(editing ? "Pricing updated." : "Pricing saved.")
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not save pricing.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit zone pricing" : "Add zone pricing"}
      description={
        editing
          ? "Update the delivery pricing between these two zones. Existing orders keep the fee they were quoted."
          : "Define delivery pricing between two zones."
      }
      size="lg"
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel={editing ? "Save changes" : "Save pricing"}
    >
      <div className="grid grid-cols-1 gap-4 pt-2 pb-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>From zone</Label>
          <Select
            value={fromZoneId}
            onValueChange={(v) => setFromZoneId(v ?? "")}
            disabled={Boolean(editing)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>To zone</Label>
          <Select
            value={toZoneId}
            onValueChange={(v) => setToZoneId(v ?? "")}
            disabled={Boolean(editing)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="base-rate">Base rate</Label>
          <Input
            id="base-rate"
            type="number"
            min="0"
            step="0.01"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="extra-rate">Extra per KG</Label>
          <Input
            id="extra-rate"
            type="number"
            min="0"
            step="0.01"
            value={extraRatePerKg}
            onChange={(e) => setExtraRatePerKg(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="free-weight">Free weight (KG)</Label>
          <Input
            id="free-weight"
            type="number"
            min="0"
            step="0.1"
            value={freeWeightKg}
            onChange={(e) => setFreeWeightKg(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="max-weight">Max weight (KG)</Label>
          <Input
            id="max-weight"
            type="number"
            min="0"
            step="0.1"
            value={maxWeightKg}
            onChange={(e) => setMaxWeightKg(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cod-fee">COD fee %</Label>
          <Input
            id="cod-fee"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={codFeePercentage}
            onChange={(e) => setCodFeePercentage(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cancellation-fee">Cancellation fee</Label>
          <Input
            id="cancellation-fee"
            type="number"
            min="0"
            step="0.01"
            value={cancellationFee}
            onChange={(e) => setCancellationFee(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  )
}
