"use client"

import { Loader2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AdminUser } from "../hooks/use-users"

interface ResetPasswordDialogProps {
  user: AdminUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (password: string) => Promise<{ ok: boolean; error?: string }>
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setPassword("")
      setConfirm("")
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("Passwords do not match.")
      return
    }
    setSubmitting(true)
    try {
      const result = await onSubmit(password)
      if (!result.ok) {
        toast.error(result.error ?? "Failed to reset the password.")
        return
      }
      toast.success(`Password updated for ${user?.email ?? "the user"}.`)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reset password"
      description={`Set a new password for ${user?.email ?? "this account"}. The user will need it the next time they sign in.`}
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
            data-testid="users-reset-submit"
            disabled={submitting || password.length < 8}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Reset password"
            )}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            data-testid="users-reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-password-confirm">Confirm password</Label>
          <Input
            id="reset-password-confirm"
            data-testid="users-reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
          />
        </div>
      </div>
    </FormDialog>
  )
}
