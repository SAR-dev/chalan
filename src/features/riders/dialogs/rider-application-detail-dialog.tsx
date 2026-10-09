"use client"

import { useEffect, useState } from "react"
import { ImageZoom } from "@/components/image-zoom"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogContentBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  VEHICLE_TYPE_OPTIONS,
  VEHICLE_TYPES_REQUIRING_PLATE,
  vehicleTypeLabel,
} from "@/features/riders/dialogs/task-type"
import type { RiderApplication } from "@/features/riders/hooks/use-rider-applications"
import { RIDER_TASK_TYPE_LABELS } from "@/lib/constants"
import { toast } from "@/lib/notify"
import type { RiderVehicleType } from "@/lib/types"

interface WarehouseOption {
  id: string
  name: string
  city: string
}

interface RiderApplicationDetailDialogProps {
  application: RiderApplication | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved: () => void
  onRejected: () => void
}

export function RiderApplicationDetailDialog({
  application,
  open,
  onOpenChange,
  onApproved,
  onRejected,
}: RiderApplicationDetailDialogProps) {
  const [taskType, setTaskType] = useState<string>("DELIVERY")
  const [vehicleType, setVehicleType] = useState<RiderVehicleType | "">("")
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [rejectReason, setRejectReason] = useState("")
  const [loadingApprove, setLoadingApprove] = useState(false)
  const [loadingReject, setLoadingReject] = useState(false)
  const [mode, setMode] = useState<"view" | "approve" | "reject">("view")

  useEffect(() => {
    if (!open) return
    fetch("/api/warehouses/public")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: WarehouseOption[]) => setWarehouses(rows))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (application && mode === "approve") {
      setWarehouseId(application.warehouseId ?? "")
      // Prefill from what the applicant submitted instead of starting blank.
      //
      // Blank was wrong twice over. It threw the submitted value away, and the
      // payload below then sent `vehicleType || null` — so approving would
      // write null over a vehicle the registration form had just collected.
      // Approval silently destroyed the data it was meant to review.
      //
      // Prefilling *from this application* also preserves the original reason
      // the reset existed (the comment above it used to warn about the
      // previous applicant's motorbike leaking onto this one): each open
      // re-reads from the row being approved, so that leak cannot happen.
      setVehicleType(application.vehicleType ?? "")
      setVehiclePlate(application.vehiclePlate ?? "")
    }
  }, [application, mode])

  async function handleApprove() {
    if (!application) return
    setLoadingApprove(true)
    try {
      const res = await fetch(
        `/api/rider-applications/${application.id}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType,
            warehouseId,
            // Sent even when blank, as an explicit null. The value now starts
            // as whatever the applicant submitted, so `null` here can only mean
            // nobody declared a vehicle — never "the form did not load in
            // time". Omitting the key instead would leave the record untouched
            // and make "cleared by the approver" indistinguishable from "not
            // asked", which is the distinction an audit trail needs.
            vehicleType: vehicleType || null,
            vehiclePlate:
              vehicleType && VEHICLE_TYPES_REQUIRING_PLATE.has(vehicleType)
                ? vehiclePlate.trim()
                : null,
          }),
        },
      )
      if (res.ok) {
        onApproved()
        onOpenChange(false)
        setMode("view")
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? "Failed to approve the rider application.")
      }
    } finally {
      setLoadingApprove(false)
    }
  }

  async function handleReject() {
    if (!application) return
    setLoadingReject(true)
    try {
      const res = await fetch(
        `/api/rider-applications/${application.id}/reject`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason }),
        },
      )
      if (res.ok) {
        onRejected()
        onOpenChange(false)
        setMode("view")
        setRejectReason("")
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? "Failed to reject the rider application.")
      }
    } finally {
      setLoadingReject(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setMode("view")
      setRejectReason("")
      setWarehouseId("")
    }
  }

  if (!application) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rider Application</DialogTitle>
          <DialogDescription>
            Review {application.name}'s application and NID documents.
          </DialogDescription>
        </DialogHeader>

        <DialogContentBody>
          <div className="flex flex-col gap-4 py-4">
            {/* Personal Info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground text-xs">Name</span>
                <p className="text-sm font-medium">{application.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Email</span>
                <p className="text-sm font-medium">{application.email}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Phone</span>
                <p className="text-sm font-medium">{application.phone}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Zone</span>
                <p className="text-sm font-medium">{application.zone}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground text-xs">Address</span>
                <p className="text-sm font-medium">{application.address}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  NID Number
                </span>
                <p className="text-sm font-medium">
                  {application.nidNumber ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Warehouse</span>
                <p className="text-sm font-medium">
                  {application.warehouseName ?? "—"}
                </p>
              </div>
            </div>

            {/* NID Images */}
            {(application.nidFrontImage ||
              application.nidBackImage ||
              application.nidSelfieImage) && (
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  NID Documents
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {application.nidFrontImage && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">
                        NID Front
                      </span>
                      <ImageZoom
                        src={application.nidFrontImage}
                        alt="NID front"
                        className="w-full rounded-md border"
                      />
                    </div>
                  )}
                  {application.nidBackImage && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">
                        NID Back
                      </span>
                      <ImageZoom
                        src={application.nidBackImage}
                        alt="NID back"
                        className="w-full rounded-md border"
                      />
                    </div>
                  )}
                  {application.nidSelfieImage && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">
                        Selfie with NID
                      </span>
                      <ImageZoom
                        src={application.nidSelfieImage}
                        alt="Selfie with NID"
                        className="w-full rounded-md border"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Approve mode */}
            {mode === "approve" && (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="taskType">Task Type</Label>
                  <Select
                    value={taskType}
                    onValueChange={(v) => setTaskType(v as string)}
                  >
                    <SelectTrigger id="taskType" className="w-full">
                      <SelectValue>
                        {RIDER_TASK_TYPE_LABELS[
                          taskType as keyof typeof RIDER_TASK_TYPE_LABELS
                        ] ?? taskType}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RIDER_TASK_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="approveVehicleType">Vehicle</Label>
                  <Select
                    value={vehicleType}
                    onValueChange={(v) =>
                      setVehicleType((v as RiderVehicleType) ?? "")
                    }
                  >
                    <SelectTrigger
                      id="approveVehicleType"
                      className="w-full"
                      data-testid="approve-vehicle-type"
                    >
                      <SelectValue placeholder="Not recorded">
                        {(value) =>
                          value
                            ? vehicleTypeLabel(value as RiderVehicleType)
                            : "Not recorded"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPE_OPTIONS.map((o) => (
                        <SelectItem
                          key={o.value}
                          value={o.value}
                          data-testid={`approve-vehicle-option-${o.value}`}
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
                  {/* The review step: say where the value came from, because a
                      pre-filled field reads identically whether the applicant
                      supplied it or a previous reviewer did. */}
                  <p
                    className="text-muted-foreground text-xs"
                    data-testid={
                      application?.vehicleType
                        ? "approve-vehicle-submitted"
                        : "approve-vehicle-unstated"
                    }
                  >
                    {application?.vehicleType ? (
                      <>
                        Submitted by the applicant. Change it if it is wrong —
                        this is what the pickup and dispatch dialogs show when a
                        parcel is assigned.
                      </>
                    ) : (
                      <>
                        Not stated by the applicant. Add it now so parcels can
                        be assigned to this rider sensibly.
                      </>
                    )}
                  </p>
                </div>
                {vehicleType &&
                  VEHICLE_TYPES_REQUIRING_PLATE.has(vehicleType) && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="approveVehiclePlate">
                        Registration number
                      </Label>
                      <Input
                        id="approveVehiclePlate"
                        data-testid="approve-vehicle-plate"
                        value={vehiclePlate}
                        onChange={(e) => setVehiclePlate(e.target.value)}
                        placeholder="DHAKA-1234"
                        className="uppercase"
                      />
                    </div>
                  )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="overrideWarehouse">Warehouse</Label>
                  <Select
                    value={warehouseId}
                    onValueChange={(v) => setWarehouseId(v ?? "")}
                  >
                    <SelectTrigger id="overrideWarehouse" className="w-full">
                      <SelectValue placeholder="Select a warehouse">
                        {(() => {
                          const w = warehouses.find((x) => x.id === warehouseId)
                          return w ? `${w.name}-${w.city}` : undefined
                        })()}
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
                  <p className="text-muted-foreground text-xs">
                    Override the rider's selected warehouse if needed.
                  </p>
                </div>
              </div>
            )}

            {/* Reject mode */}
            {mode === "reject" && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <Label htmlFor="rejectReason">Rejection reason</Label>
                <Textarea
                  id="rejectReason"
                  placeholder="Explain why this application is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>
        </DialogContentBody>

        <DialogFooter>
          {mode === "view" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {application.status === "PENDING" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => setMode("reject")}
                    data-testid="rider-app-reject"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => setMode("approve")}
                    data-testid="rider-app-approve"
                  >
                    Approve
                  </Button>
                </>
              )}
            </>
          ) : mode === "approve" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setMode("view")}
                disabled={loadingApprove}
              >
                Back
              </Button>
              <Button
                onClick={handleApprove}
                disabled={loadingApprove}
                data-testid="rider-app-confirm-approve"
              >
                {loadingApprove ? "Approving..." : "Confirm Approval"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setMode("view")}
                disabled={loadingReject}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={loadingReject || !rejectReason.trim()}
              >
                {loadingReject ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
