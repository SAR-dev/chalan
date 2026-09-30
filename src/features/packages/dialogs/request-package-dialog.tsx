"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  type PackageRow,
  usePackages,
} from "@/features/packages/hooks/use-packages"
import { formatTk } from "@/lib/pricing"

interface Props {
  pkg: PackageRow
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RequestPackageDialog({ pkg, open, onOpenChange }: Props) {
  const { requestPackage } = usePackages()
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await requestPackage(pkg.id, note.trim() || undefined)
    setSubmitting(false)

    if (!res.ok) {
      toast.error(res.error ?? "Could not request the package.")
      return
    }
    toast.success(
      `Requested "${pkg.name}". An admin will confirm your payment.`,
    )
    setNote("")
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Request ${pkg.name}`}
      description={`${formatTk(Number(pkg.price))} — transfer the amount, then an admin confirms and activates the bundle.`}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Submit request"
      submitTestId="package-request-submit"
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <p className="font-medium">{pkg.name}</p>
          {pkg.description ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {pkg.description}
            </p>
          ) : null}
          <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
            {pkg.tiers.map((t) => (
              <li key={t.id}>
                {t.orderCount} orders →{" "}
                {t.ruleType === "FLAT"
                  ? `${formatTk(t.ruleValue)} delivery`
                  : `${t.ruleValue}% off delivery`}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pkg-request-note">Payment note (optional)</Label>
          <Textarea
            id="pkg-request-note"
            data-testid="package-request-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Sent 1000 TK via bKash, trxID ABC123"
            className="min-h-20"
          />
          <p className="text-muted-foreground text-xs">
            Include your transfer reference so the admin can match the payment.
          </p>
        </div>
      </div>
    </FormDialog>
  )
}
