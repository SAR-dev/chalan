"use client"

import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { usePackages } from "@/features/packages/hooks/use-packages"
import { toast } from "@/lib/notify"
import { packageUpsertSchema, validateFormData } from "@/lib/validation"

const EMPTY = { name: "", description: "", price: "", isActive: true }

export function CreatePackageDialog() {
  const { createPackage } = usePackages()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors = validateFormData(packageUpsertSchema, {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price),
      isActive: form.isActive,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const res = await createPackage({
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      isActive: form.isActive,
    })
    setSubmitting(false)

    if (!res.ok) {
      toast.error(res.error ?? "Could not create the package.")
      return
    }
    toast.success(`Package "${form.name.trim()}" created.`)
    setForm(EMPTY)
    setOpen(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setForm(EMPTY)
          setErrors({})
        }
      }}
      trigger={<Button data-testid="packages-create">New package</Button>}
      title="New package"
      description="A package is a prepaid bundle. Its tiers award a delivery-fee discount as the merchant ships more orders."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create package"
      submitTestId="package-save"
      submitDisabled={!form.name.trim() || form.price.trim() === ""}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="pkg-name">Name</Label>
          <Input
            id="pkg-name"
            data-testid="package-name-input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Starter 100"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pkg-desc">Description</Label>
          <Textarea
            id="pkg-desc"
            data-testid="package-description-input"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="What this bundle includes…"
            className="min-h-20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pkg-price">Price (Tk)</Label>
          <Input
            id="pkg-price"
            data-testid="package-price-input"
            type="number"
            min={0}
            step={1}
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
            placeholder="1000"
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="pkg-active"
            data-testid="package-active-switch"
            checked={form.isActive}
            onCheckedChange={(v) => update("isActive", v)}
          />
          <Label htmlFor="pkg-active">
            Active — merchants can see and request this package
          </Label>
        </div>
      </div>
    </FormDialog>
  )
}
