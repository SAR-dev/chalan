"use client"

import { useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  type PackageRow,
  usePackages,
} from "@/features/packages/hooks/use-packages"
import { toast } from "@/lib/notify"
import { packageUpsertSchema, validateFormData } from "@/lib/validation"

interface Props {
  pkg: PackageRow | null
  onClose: () => void
}

export function EditPackageDialog({ pkg, onClose }: Props) {
  const { updatePackage } = usePackages()
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    isActive: true,
  })

  // Sync form fields whenever a different package is opened.
  useEffect(() => {
    if (!pkg) return
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      price: String(pkg.price),
      isActive: pkg.isActive,
    })
    setErrors({})
  }, [pkg])

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pkg) return
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
    const res = await updatePackage(pkg.id, {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      isActive: form.isActive,
    })
    setSubmitting(false)

    if (!res.ok) {
      toast.error(res.error ?? "Could not update the package.")
      return
    }
    toast.success(`Package "${form.name.trim()}" updated.`)
    onClose()
  }

  return (
    <FormDialog
      open={pkg !== null}
      onOpenChange={(next) => !next && onClose()}
      title="Edit package"
      description="Editing the price does not change the price already snapshotted onto pending purchase requests."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Save changes"
      submitTestId="package-save"
      submitDisabled={!form.name.trim() || form.price.trim() === ""}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-pkg-name">Name</Label>
          <Input
            id="edit-pkg-name"
            data-testid="package-name-input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-pkg-desc">Description</Label>
          <Textarea
            id="edit-pkg-desc"
            data-testid="package-description-input"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="min-h-20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-pkg-price">Price (Tk)</Label>
          <Input
            id="edit-pkg-price"
            data-testid="package-price-input"
            type="number"
            min={0}
            step={1}
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="edit-pkg-active"
            data-testid="package-active-switch"
            checked={form.isActive}
            onCheckedChange={(v) => update("isActive", v)}
          />
          <Label htmlFor="edit-pkg-active">
            Active — merchants can see and request this package
          </Label>
        </div>
      </div>
    </FormDialog>
  )
}
