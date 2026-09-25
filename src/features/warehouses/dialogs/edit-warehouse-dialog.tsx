"use client"

import { Warehouse as WarehouseIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Warehouse } from "@/lib/types"
import { validateFormData, warehouseUpdateSchema } from "@/lib/validation"

export function EditWarehouseDialog({
  warehouse,
  open,
  onOpenChange,
}: {
  warehouse: Warehouse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateWarehouse } = useWarehouses()
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    isActive: true,
  })

  const [warehouseId, setWarehouseId] = useState(warehouse?.id ?? null)
  if (warehouse && warehouse.id !== warehouseId) {
    setWarehouseId(warehouse.id)
    setForm({
      name: warehouse.name,
      address: warehouse.address,
      city: warehouse.city,
      isActive: warehouse.isActive,
    })
  }

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!warehouse) return
    const fieldErrors = validateFormData(warehouseUpdateSchema, {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      isActive: form.isActive,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await updateWarehouse(warehouse.id, {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        isActive: form.isActive,
      })
      toast.success(`${form.name.trim()} updated.`)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update warehouse.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!warehouse) return null

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
      }}
      title={warehouse.name}
      description="Warehouse details"
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Save changes"
      submitIcon={<WarehouseIcon className="size-4" />}
      cancelLabel="Cancel"
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-warehouse-name">Warehouse name</Label>
          <Input
            id="edit-warehouse-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-warehouse-address">Address</Label>
          <Input
            id="edit-warehouse-address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-warehouse-city">City</Label>
          <Input
            id="edit-warehouse-city"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="edit-warehouse-active" className="cursor-pointer">
              Active status
            </Label>
            <span className="text-muted-foreground text-xs">
              {form.isActive
                ? "Warehouse is currently active"
                : "Warehouse is currently disabled"}
            </span>
          </div>
          <Switch
            id="edit-warehouse-active"
            checked={form.isActive}
            onCheckedChange={(checked) => update("isActive", checked)}
            aria-label="Toggle active status"
          />
        </div>
      </div>
    </FormDialog>
  )
}
