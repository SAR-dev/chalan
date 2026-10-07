"use client"

import { Loader2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/notify"
import type { AdminUser } from "../hooks/use-users"

interface BanDialogProps {
  user: AdminUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    reason: string
    expiresInDays?: number
  }) => Promise<{ ok: boolean; error?: string }>
}

export function BanDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
}: BanDialogProps) {
  const [reason, setReason] = useState("")
  const [days, setDays] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason("")
      setDays("")
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      toast.error("Reason must be at least 3 characters.")
      return
    }
    const parsedDays = days.trim() === "" ? undefined : Number(days)
    if (
      parsedDays !== undefined &&
      (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365)
    ) {
      toast.error("Duration must be between 1 and 365 days.")
      return
    }
    setSubmitting(true)
    try {
      const result = await onSubmit({
        reason: trimmed,
        ...(parsedDays !== undefined ? { expiresInDays: parsedDays } : {}),
      })
      if (!result.ok) {
        toast.error(result.error ?? "Failed to ban the user.")
        return
      }
      toast.success(`${user?.email ?? "The user"} banned.`)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ban user"
      description={`${user?.email ?? "This user"} will be signed out and blocked from signing in until unbanned.`}
      onSubmit={handleSubmit}
      footer={
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            data-testid="users-ban-submit"
            disabled={submitting || reason.trim().length < 3}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Banning…
              </>
            ) : (
              "Ban user"
            )}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ban-reason">Reason</Label>
          <Textarea
            id="ban-reason"
            data-testid="users-ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Violation of the platform terms."
            rows={3}
            maxLength={200}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ban-duration">Duration in days (optional)</Label>
          <Input
            id="ban-duration"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="Leave empty for a permanent ban"
          />
        </div>
      </div>
    </FormDialog>
  )
}
