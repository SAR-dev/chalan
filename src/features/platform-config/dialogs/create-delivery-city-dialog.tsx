"use client"

import { useState } from "react"
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
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"

export function CreateDeliveryCityDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { createCity } = useDeliveryCities()
  const { zones } = useDeliveryZones()
  const { warehouses } = useWarehouses()
  const [name, setName] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("City name is required.")
      return
    }
    if (!zoneId) {
      toast.error("Zone is required.")
      return
    }
    if (!warehouseId) {
      toast.error("Warehouse is required.")
      return
    }
    setSubmitting(true)
    try {
      const result = await createCity({
        name: name.trim(),
        zoneId,
        warehouseId,
      })
      if (result.ok) {
        toast.success(`${name.trim()} added.`)
        setName("")
        setZoneId("")
        setWarehouseId("")
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not create city.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add delivery city"
      description="Add a city that merchants can select when creating orders."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Adding"
      submitLabel="Add city"
    >
      <div className="flex flex-col gap-4 pt-2 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city-name">City name</Label>
          <Input
            id="city-name"
            placeholder="e.g. Dhaka"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Zone</Label>
          <Select value={zoneId} onValueChange={(v) => setZoneId(v ?? "")}>
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
          <Label>Warehouse</Label>
          <Select
            value={warehouseId}
            onValueChange={(v) => setWarehouseId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} - {w.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormDialog>
  )
}
