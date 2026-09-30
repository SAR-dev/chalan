"use client"

import { UserPen } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
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
import { Switch } from "@/components/ui/switch"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { RiderTaskType, RiderVehicleType } from "@/lib/types"
import { riderUpdateSchema, validateFormData } from "@/lib/validation"
import {
  TASK_TYPE_OPTIONS,
  taskTypeLabel,
  VEHICLE_TYPE_OPTIONS,
  VEHICLE_TYPES_REQUIRING_PLATE,
  vehicleTypeLabel,
} from "../task-type"
import type { EditRiderDialogProps } from "./types"

export function EditRiderDialog({
  rider,
  open,
  onOpenChange,
  canReassignWarehouse = true,
}: EditRiderDialogProps) {
  const { updateRider, toggleRiderActive } = useRiders()
  const { warehouses } = useWarehouses()
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: "",
    phone: "",
    zone: "",
    warehouseId: "",
    taskType: "DELIVERY" as RiderTaskType,
    vehicleType: "" as RiderVehicleType | "",
    vehiclePlate: "",
    isActive: true,
  })
  const [openCount, setOpenCount] = useState(0)
  const prevOpen = useRef(open)

  useEffect(() => {
    if (open && !prevOpen.current && rider) {
      setOpenCount((c) => c + 1)
      setErrors({})
      setForm({
        name: rider.name,
        phone: rider.phone,
        zone: rider.zone,
        warehouseId: rider.warehouseId,
        taskType: rider.taskType,
        vehicleType: rider.vehicleType ?? "",
        vehiclePlate: rider.vehiclePlate ?? "",
        isActive: rider.isActive,
      })
    }
    prevOpen.current = open
  }, [open, rider])

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rider) return
    // A plate for a vehicle that does not need one (a bicycle) is a data-entry
    // slip, not information — dropped here rather than stored and then shown
    // back as a confusing "Bicycle · XYZ" to whoever reads it later.
    const vehicleType = form.vehicleType || null
    const rawPlate = form.vehiclePlate.trim()
    const vehiclePlate =
      vehicleType && !VEHICLE_TYPES_REQUIRING_PLATE.has(vehicleType)
        ? null
        : rawPlate || null
    const fieldErrors = validateFormData(riderUpdateSchema, {
      name: form.name.trim(),
      phone: form.phone.trim(),
      zone: form.zone.trim(),
      warehouseId: canReassignWarehouse ? form.warehouseId : undefined,
      taskType: form.taskType,
      vehicleType,
      vehiclePlate,
      isActive: form.isActive,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await updateRider(rider.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        zone: form.zone.trim(),
        taskType: form.taskType,
        vehicleType,
        vehiclePlate,
        ...(canReassignWarehouse ? { warehouseId: form.warehouseId } : {}),
      })
      if (form.isActive !== rider.isActive) {
        await toggleRiderActive(rider.id)
      }
      toast.success(`${form.name.trim()} updated.`)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!rider) return null

  return (
    <FormDialog
      key={`${rider.id}-${openCount}`}
      open={open}
      onOpenChange={onOpenChange}
      title="Edit rider"
      description={
        canReassignWarehouse
          ? "Update rider details, task type, and home warehouse."
          : "Update rider details and task type."
      }
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Save changes"
      submitIcon={<UserPen className="size-4" />}
      cancelLabel="Cancel"
      onCancel={() => onOpenChange(false)}
      fullWidthButtons
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-rider-name">Full name</Label>
          <Input
            id="edit-rider-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Karim Hossain"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-rider-phone">Phone</Label>
            <Input
              id="edit-rider-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+8801711000000"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-rider-zone">Service zone</Label>
            <Input
              id="edit-rider-zone"
              value={form.zone}
              onChange={(e) => update("zone", e.target.value)}
              placeholder="Dhaka North"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-rider-task-type">Task type</Label>
          <Select
            value={form.taskType}
            onValueChange={(v) =>
              update("taskType", (v as RiderTaskType) ?? "DELIVERY")
            }
          >
            <SelectTrigger id="edit-rider-task-type" className="w-full">
              <SelectValue>
                {(value) => taskTypeLabel(value as RiderTaskType)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-rider-vehicle-type">Vehicle</Label>
          <Select
            value={form.vehicleType}
            onValueChange={(v) =>
              update("vehicleType", (v as RiderVehicleType) || "")
            }
          >
            <SelectTrigger
              id="edit-rider-vehicle-type"
              className="w-full"
              data-testid="edit-rider-vehicle-type"
            >
              <SelectValue placeholder="No vehicle recorded">
                {(value) =>
                  value
                    ? vehicleTypeLabel(value as RiderVehicleType)
                    : "No vehicle recorded"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPE_OPTIONS.map((o) => (
                <SelectItem
                  key={o.value}
                  value={o.value}
                  data-testid={`edit-rider-vehicle-option-${o.value}`}
                >
                  <span className="flex flex-col">
                    <span>{o.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {o.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            Shown beside the rider when a parcel is assigned, so the admin can
            pick someone whose vehicle suits the load.
          </span>
        </div>

        {form.vehicleType &&
          VEHICLE_TYPES_REQUIRING_PLATE.has(form.vehicleType) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-rider-vehicle-plate">
                Registration number
              </Label>
              <Input
                id="edit-rider-vehicle-plate"
                data-testid="edit-rider-vehicle-plate"
                value={form.vehiclePlate}
                onChange={(e) => update("vehiclePlate", e.target.value)}
                placeholder="DHAKA-1234"
                className="uppercase"
              />
            </div>
          )}

        {canReassignWarehouse && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-rider-warehouse">Warehouse</Label>{" "}
            <Select
              value={form.warehouseId}
              onValueChange={(v) => update("warehouseId", v ?? "")}
            >
              <SelectTrigger id="edit-rider-warehouse" className="w-full">
                <SelectValue placeholder="Select a warehouse">
                  {(value) => {
                    const w = warehouses.find((x) => x.id === value)
                    return w ? `${w.name}-${w.city}` : "Select a warehouse"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}-{w.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="edit-rider-active" className="cursor-pointer">
              Active status
            </Label>
            <span className="text-muted-foreground text-xs">
              {form.isActive
                ? "Rider is currently active"
                : "Rider is currently disabled"}
            </span>
          </div>
          <Switch
            id="edit-rider-active"
            checked={form.isActive}
            onCheckedChange={(checked) => update("isActive", checked)}
            aria-label="Toggle active status"
          />
        </div>
      </div>
    </FormDialog>
  )
}
