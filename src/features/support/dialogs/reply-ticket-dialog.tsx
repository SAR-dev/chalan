"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SupportStatusBadge } from "@/features/support/components/support-status-badge"
import { useSupport } from "@/features/support/hooks/use-support"
import type { SupportTicket } from "@/lib/types"
import { supportReplySchema, validateFormData } from "@/lib/validation"

export function ReplyTicketDialog({
  ticket,
  onClose,
}: {
  ticket: SupportTicket | null
  onClose: () => void
}) {
  const { replyTicket } = useSupport()
  const [reply, setReply] = useState("")
  const [closeAfter, setCloseAfter] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (ticket) {
      setReply("")
      setCloseAfter(false)
      setErrors({})
    }
  }, [ticket])

  const canSubmit = Boolean(ticket && (reply.trim() || closeAfter))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticket) return
    const payload = {
      ...(reply.trim() ? { adminReply: reply.trim() } : {}),
      ...(closeAfter ? { status: "CLOSED" as const } : {}),
    }
    const fieldErrors = validateFormData(supportReplySchema, payload)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const res = await replyTicket(ticket.id, payload)
    setSubmitting(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not update this ticket.")
      return
    }
    toast.success(closeAfter ? "Ticket replied to and closed." : "Reply sent.")
    setReply("")
    setCloseAfter(false)
    onClose()
  }

  return (
    <FormDialog
      open={ticket !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Reply to support ticket"
      description="Your reply is shown to the person who opened this ticket."
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="support-reply-submit"
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : closeAfter && !reply.trim() ? (
              "Close ticket"
            ) : (
              "Send reply"
            )}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        {ticket ? (
          <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{ticket.subject}</p>
              <SupportStatusBadge status={ticket.status} />
            </div>
            <p className="text-muted-foreground line-clamp-4 whitespace-pre-wrap text-sm">
              {ticket.message}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="support-reply">Reply</Label>
          <Textarea
            id="support-reply"
            data-testid="support-reply-input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write your answer to the requester…"
            className="min-h-32"
            maxLength={2000}
            autoFocus
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="support-close-after"
            checked={closeAfter}
            onCheckedChange={setCloseAfter}
          />
          <Label htmlFor="support-close-after">
            Close this ticket after replying
          </Label>
        </div>
      </div>
    </FormDialog>
  )
}
