"use client"

import {
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Store,
  Trash2,
  Warehouse,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { toast } from "@/lib/notify"
import type { PickupLocation } from "@/lib/types"

interface FormState {
  label: string
  address: string
  cityId: string
  mapLink: string
}

function emptyForm(): FormState {
  return {
    label: "",
    address: "",
    cityId: "",
    mapLink: "",
  }
}

function formFromLocation(loc: PickupLocation): FormState {
  return {
    label: loc.label,
    address: loc.address,
    cityId: loc.cityId ?? "",
    mapLink: loc.mapLink ?? "",
  }
}

export function PickupLocationsManager({ merchantId }: { merchantId: string }) {
  const {
    pickupLocations,
    createPickupLocation,
    updatePickupLocation,
    deletePickupLocation,
  } = usePickupLocations()
  const { cities: deliveryCities } = useDeliveryCities()

  const shops = useMemo(
    () => pickupLocations.filter((p) => p.merchantId === merchantId),
    [pickupLocations, merchantId],
  )

  // editing === null && dialogOpen means "adding"; editing set means "editing".
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PickupLocation | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PickupLocation | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(loc: PickupLocation) {
    setEditing(loc)
    setForm(formFromLocation(loc))
    setDialogOpen(true)
  }

  const selectedCity = useMemo(
    () => deliveryCities.find((c) => c.id === form.cityId),
    [deliveryCities, form.cityId],
  )

  const trimmedLabel = form.label.trim()
  const trimmedAddress = form.address.trim()
  const formValid =
    trimmedLabel.length > 0 &&
    trimmedAddress.length > 0 &&
    form.cityId.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formValid) return
    const payload = {
      label: trimmedLabel,
      address: trimmedAddress,
      cityId: form.cityId,
      mapLink: form.mapLink.trim() || undefined,
    }
    setSaving(true)
    try {
      const result = editing
        ? await updatePickupLocation(editing.id, payload)
        : await createPickupLocation(payload)
      if (result.ok) {
        toast.success(
          editing ? "Pickup location updated." : "Pickup location added.",
        )
        setDialogOpen(false)
      } else {
        toast.error(result.error ?? "Could not save the pickup location.")
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deletePickupLocation(deleteTarget.id)
      if (result.ok) {
        toast.success("Pickup location removed.")
        setDeleteTarget(null)
      } else {
        toast.error(result.error ?? "Could not remove the pickup location.")
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="size-4" />
            Pickup locations
          </CardTitle>
          <CardDescription>
            Register your pickup locations with a map link so riders can find
            them quickly.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              size="sm"
              onClick={openAdd}
              data-testid="add-pickup-location"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {shops.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
              No pickup locations yet. Add your first one to get started.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {shops.map((shop) => {
                const mapLink = shop.mapLink?.trim() || null
                return (
                  <li
                    key={shop.id}
                    className="border-border flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">{shop.label}</span>
                      <span className="text-muted-foreground flex items-start gap-1.5 text-sm leading-snug">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        {shop.address}
                      </span>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        {mapLink ? (
                          <a
                            href={mapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            Map link
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            No map link
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(shop)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(shop)}
                        aria-label={`Remove ${shop.label}`}
                        data-testid={`remove-pickup-location-${shop.label}`}
                      >
                        <Trash2 className="text-muted-foreground size-4" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit pickup location" : "Add Pickup Location"}
              </DialogTitle>
              <DialogDescription>
                Provide the pickup location name and address, plus an optional
                map link.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pickup-label">Pickup Location name</Label>
              <Input
                id="pickup-label"
                value={form.label}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="e.g. Gulshan branch"
                aria-invalid={trimmedLabel.length === 0}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pickup-address">Address</Label>
              <Textarea
                id="pickup-address"
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="Street, area, city"
                rows={3}
                aria-invalid={trimmedAddress.length === 0}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pickup-city">City</Label>
              <Select
                value={form.cityId}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, cityId: v ?? "" }))
                }
              >
                <SelectTrigger
                  id="pickup-city"
                  className="w-full"
                  aria-invalid={form.cityId.length === 0}
                >
                  <SelectValue placeholder="Select a city">
                    {selectedCity?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {deliveryCities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCity?.warehouseName && (
              <div className="flex flex-col gap-2">
                <Label>Warehouse</Label>
                <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                  <Warehouse className="size-3.5 shrink-0" />
                  {selectedCity.warehouseName}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="pickup-map">
                <span className="flex items-center gap-1.5">
                  <MapPin className="text-muted-foreground size-3.5" />
                  Map link
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </span>
              </Label>
              <Input
                id="pickup-map"
                type="url"
                value={form.mapLink}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, mapLink: e.target.value }))
                }
                placeholder="https://maps.google.com/?q=..."
              />
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={saving || !formValid}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving
                  </>
                ) : editing ? (
                  "Save pickup location"
                ) : (
                  "Add Pickup Location"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove pickup location?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.label}" will be removed from your pickup locations. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Removing
                </>
              ) : (
                "Remove pickup location"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
