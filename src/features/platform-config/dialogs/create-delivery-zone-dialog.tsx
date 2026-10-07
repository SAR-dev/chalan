"use client"

import { useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { toast } from "@/lib/notify"

export function CreateDeliveryZoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { createZone } = useDeliveryZones()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Zone name is required.")
      return
    }
    setSubmitting(true)
    try {
      const result = await createZone(name.trim())
      if (result.ok) {
        toast.success(`${name.trim()} added.`)
        setName("")
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Could not create zone.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add delivery zone"
      description="Add a zone that groups cities sharing the same delivery pricing."
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Adding"
      submitLabel="Add zone"
    >
      <div className="flex flex-col gap-2 pt-2 pb-4">
        <Label htmlFor="zone-name">Zone name</Label>
        <Input
          id="zone-name"
          placeholder="e.g. Dhaka"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </FormDialog>
  )
}
