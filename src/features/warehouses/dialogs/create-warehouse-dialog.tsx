"use client"

import { Warehouse as WarehouseIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { validateFormData, warehouseCreateSchema } from "@/lib/validation"

export function CreateWarehouseDialog() {
  const { createWarehouse } = useWarehouses()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors = validateFormData(warehouseCreateSchema, {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const res = await createWarehouse({
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
      })
      if (!res.ok) {
        toast.error(res.error ?? "Could not create the warehouse.")
        return
      }
      toast.success(`Warehouse "${form.name.trim()}" created.`)
      setForm({ name: "", address: "", city: "" })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setForm({ name: "", address: "", city: "" })
      }}
      trigger={
        <Button>
          <WarehouseIcon className="size-4" />
          Add warehouse
        </Button>
      }
      title="Add warehouse"
      description="Create a new warehouse location."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create"
    >
      <div className="grid grid-cols-1 gap-4 pt-2">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-warehouse-name">Warehouse name</Label>
          <Input
            id="create-warehouse-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Gulshan Hub"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-warehouse-address">Address</Label>
          <Input
            id="create-warehouse-address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="e.g. 123 Gulshan Avenue"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-warehouse-city">City</Label>
          <Input
            id="create-warehouse-city"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="e.g. Dhaka"
          />
        </div>
      </div>
    </FormDialog>
  )
}
