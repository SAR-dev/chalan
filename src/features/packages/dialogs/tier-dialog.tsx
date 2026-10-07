"use client"

import { useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type PackageRow,
  type PackageTier,
  usePackages,
} from "@/features/packages/hooks/use-packages"
import { PACKAGE_RULE_TYPES } from "@/lib/constants"
import { toast } from "@/lib/notify"
import type { PackageRuleType } from "@/lib/types"
import {
  packageTierUpsertSchema,
  validateFormData,
  validateTierRule,
} from "@/lib/validation"

const RULE_LABELS: Record<PackageRuleType, string> = {
  FLAT: "Flat delivery charge",
  PERCENT_OFF: "Percentage off",
}

export function TierDialog({
  pkg,
  tier,
  onClose,
}: {
  pkg: PackageRow
  /** Omit to add a tier. */
  tier?: PackageTier | null
  onClose: () => void
}) {
  const { addTier, updateTier } = usePackages()
  const editing = Boolean(tier)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    orderCount: "",
    ruleType: "FLAT" as PackageRuleType,
    ruleValue: "",
  })

  useEffect(() => {
    if (!tier) return
    setForm({
      orderCount: String(tier.orderCount),
      ruleType: tier.ruleType,
      ruleValue: String(tier.ruleValue),
    })
    setErrors({})
  }, [tier])

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors = validateFormData(packageTierUpsertSchema, {
      orderCount: Number(form.orderCount),
      ruleType: form.ruleType,
      ruleValue: Number(form.ruleValue),
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    // PERCENT_OFF is capped at 100; FLAT is unbounded. Zod cannot express the
    // conditional, so it is checked here and again on the server.
    const ruleError = validateTierRule(form.ruleType, Number(form.ruleValue))
    if (ruleError) {
      setErrors({ ruleValue: ruleError })
      return
    }
    setErrors({})
    setSubmitting(true)

    const payload = {
      orderCount: Number(form.orderCount),
      ruleType: form.ruleType,
      ruleValue: Number(form.ruleValue),
    }
    const res = editing
      ? await updateTier(pkg.id, tier!.id, payload)
      : await addTier(pkg.id, payload)
    setSubmitting(false)

    if (!res.ok) {
      toast.error(res.error ?? "Could not save the tier.")
      return
    }
    toast.success(
      editing
        ? `Tier at ${payload.orderCount} orders updated.`
        : `Tier at ${payload.orderCount} orders added.`,
    )
    onClose()
  }

  const isPercent = form.ruleType === "PERCENT_OFF"

  return (
    <FormDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={editing ? "Edit tier" : "Add tier"}
      description="A tier unlocks once the merchant has shipped that many orders on the active bundle."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={editing ? "Save tier" : "Add tier"}
      submitTestId="tier-save"
      submitDisabled={
        form.orderCount.trim() === "" || form.ruleValue.trim() === ""
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="tier-order-count">Orders shipped</Label>
          <Input
            id="tier-order-count"
            data-testid="tier-order-count-input"
            type="number"
            min={1}
            step={1}
            value={form.orderCount}
            onChange={(e) => update("orderCount", e.target.value)}
            placeholder="10"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Rule</Label>
          <Select
            value={form.ruleType}
            onValueChange={(v) => update("ruleType", v as PackageRuleType)}
          >
            <SelectTrigger data-testid="tier-rule-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PACKAGE_RULE_TYPES.map((rt) => (
                <SelectItem key={rt} value={rt} data-testid={`tier-rule-${rt}`}>
                  {RULE_LABELS[rt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tier-rule-value">
            {isPercent ? "Discount (%)" : "Delivery charge (Tk)"}
          </Label>
          <Input
            id="tier-rule-value"
            data-testid="tier-rule-value-input"
            type="number"
            min={0}
            max={isPercent ? 100 : undefined}
            step={1}
            value={form.ruleValue}
            onChange={(e) => update("ruleValue", e.target.value)}
            placeholder={isPercent ? "10" : "60"}
          />
          <p className="text-muted-foreground text-xs">
            {isPercent
              ? "Percentage off the zone delivery fee (0–100). A flat charge never raises the fee."
              : "Every delivery on this bundle costs this much, whatever the zone rate."}
          </p>
        </div>
      </div>
    </FormDialog>
  )
}
