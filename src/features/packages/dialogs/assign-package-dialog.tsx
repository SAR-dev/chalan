"use client"

import { useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePackages } from "@/features/packages/hooks/use-packages"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"

interface Props {
  /** The merchant to assign to, or null when the dialog is closed. */
  merchant: { id: string; businessName: string } | null
  onClose: () => void
}

/**
 * Admin direct-assign of a package (ops override / comped deal). Bypasses the
 * purchase-request flow and writes no ledger row — nothing was paid.
 */
export function AssignPackageDialog({ merchant, onClose }: Props) {
  const { packages, assignPackage } = usePackages()
  const [packageId, setPackageId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Reset the selection each time a different merchant is opened.
  useEffect(() => {
    if (merchant) setPackageId("")
  }, [merchant])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!merchant || !packageId) return
    setSubmitting(true)
    try {
      const res = await assignPackage(merchant.id, packageId)
      if (!res.ok) {
        toast.error(res.error ?? "Could not assign the package.")
        return
      }
      const name = packages.find((p) => p.id === packageId)?.name ?? "Package"
      toast.success(`Assigned "${name}" to ${merchant.businessName}.`)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const selected = packages.find((p) => p.id === packageId)

  return (
    <FormDialog
      open={merchant !== null}
      onOpenChange={(next) => !next && onClose()}
      title="Assign a package"
      description={`Give ${merchant?.businessName ?? "this merchant"} a bundle without a purchase request. Any bundle they already hold is closed out first.`}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Assign package"
      submitTestId="assign-package-submit"
      submitDisabled={!packageId}
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="assign-package-select">Package</Label>
          <Select
            value={packageId}
            onValueChange={(v) => setPackageId(v ?? "")}
          >
            <SelectTrigger
              id="assign-package-select"
              className="w-full"
              data-testid="assign-package-select"
            >
              <SelectValue placeholder="Select a package">
                {selected?.name ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {packages.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatTk(p.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected ? (
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <p className="font-medium">{selected.name}</p>
            <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
              {selected.tiers.map((t) => (
                <li key={t.id}>
                  {t.orderCount} orders →{" "}
                  {t.ruleType === "FLAT"
                    ? `${formatTk(t.ruleValue)} delivery`
                    : `${t.ruleValue}% off delivery`}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              Assigned bundles start at 0 orders used and are not billed.
            </p>
          </div>
        ) : null}
      </div>
    </FormDialog>
  )
}
