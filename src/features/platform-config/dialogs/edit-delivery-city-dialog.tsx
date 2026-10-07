"use client"

import { useEffect, useState } from "react"
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
import { toast } from "@/lib/notify"
import type { DeliveryCity } from "@/lib/types"

/**
 * Edits a city's name, zone and warehouse in place.
 *
 * Moving a city's zone is the expressive case: an order through that city
 * re-quotes its fee and its delivery-time promise on the new zone pair, while
 * existing orders keep the snapshot they were priced with. That is the same
 * safety rule the pricing and delivery-time editors rely on.
 */
export function EditDeliveryCityDialog({
  city,
  onOpenChange,
}: {
  city: DeliveryCity | null
  onOpenChange: (open: boolean) => void
}) {
  const { updateCity } = useDeliveryCities()
  const { zones } = useDeliveryZones()
  const { warehouses } = useWarehouses()
  const [name, setName] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!city) return
    setName(city.name)
    setZoneId(city.zoneId ?? "")
    setWarehouseId(city.warehouseId ?? "")
  }, [city])

  async function handleSubmit() {
    if (!city) return
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
      const result = await updateCity(city.id, {
        name: name.trim(),
        zoneId,
        warehouseId,
      })
      if (result.ok) {
        toast.success(`"${name.trim()}" updated.`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not update city.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={city !== null}
      onOpenChange={onOpenChange}
      title="Edit delivery city"
      description="Update this city's name, zone or warehouse. Existing orders keep the fee and delivery estimate they were quoted."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save changes"
    >
      <div className="flex flex-col gap-4 pt-2 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-city-name">City name</Label>
          <Input
            id="edit-city-name"
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
