"use client"

import { LifeBuoy, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSupport } from "@/features/support/hooks/use-support"
import { supportCreateSchema, validateFormData } from "@/lib/validation"

const EMPTY = { subject: "", message: "" }

export function CreateTicketDialog() {
  const { createTicket } = useSupport()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setForm(EMPTY)
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors = validateFormData(supportCreateSchema, {
      subject: form.subject.trim(),
      message: form.message.trim(),
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const res = await createTicket({
      subject: form.subject.trim(),
      message: form.message.trim(),
    })
    setSubmitting(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit your ticket.")
      return
    }
    toast.success("Support ticket submitted. We'll reply here.")
    reset()
    setOpen(false)
  }

  const canSubmit =
    form.subject.trim().length > 0 && form.message.trim().length > 0

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
      trigger={
        <Button data-testid="support-new">
          <LifeBuoy className="size-4" />
          New ticket
        </Button>
      }
      title="New support ticket"
      description="Tell us what you need help with — the team replies right here in your support list."
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="support-submit"
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit ticket"
            )}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="support-subject">Subject</Label>
          <Input
            id="support-subject"
            data-testid="support-subject"
            value={form.subject}
            onChange={(e) =>
              setForm((p) => ({ ...p, subject: e.target.value }))
            }
            placeholder="e.g. Payout for order ORD-100042 not received"
            maxLength={150}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="support-message">Message</Label>
          <Textarea
            id="support-message"
            data-testid="support-message"
            value={form.message}
            onChange={(e) =>
              setForm((p) => ({ ...p, message: e.target.value }))
            }
            placeholder="Describe the issue, including any order or payout reference."
            className="min-h-32"
            maxLength={2000}
          />
        </div>
      </div>
    </FormDialog>
  )
}
