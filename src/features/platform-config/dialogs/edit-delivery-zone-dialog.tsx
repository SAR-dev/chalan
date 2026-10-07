"use client"

import { useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { toast } from "@/lib/notify"
import type { DeliveryZone } from "@/lib/types"

/**
 * Renames a zone in place. Renaming is safe for the same reason editing the
 * zone pair on a pricing lane is not: a zone's id is the key every lane,
 * city and order references, so changing the *name* re-labels those references
 * without ever retargeting them.
 */
export function EditDeliveryZoneDialog({
  zone,
  onOpenChange,
}: {
  zone: DeliveryZone | null
  onOpenChange: (open: boolean) => void
}) {
  const { updateZone } = useDeliveryZones()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (zone) setName(zone.name)
  }, [zone])

  async function handleSubmit() {
    if (!zone) return
    if (!name.trim()) {
      toast.error("Zone name is required.")
      return
    }
    setSubmitting(true)
    try {
      const result = await updateZone(zone.id, { name: name.trim() })
      if (result.ok) {
        toast.success(`Zone renamed to "${name.trim()}".`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not update zone.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={zone !== null}
      onOpenChange={onOpenChange}
      title="Edit delivery zone"
      description="Rename this zone. Cities, pricing lanes and delivery times keep pointing at it."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Saving"
      submitLabel="Save changes"
    >
      <div className="flex flex-col gap-2 pt-2 pb-4">
        <Label htmlFor="edit-zone-name">Zone name</Label>
        <Input
          id="edit-zone-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </FormDialog>
  )
}
