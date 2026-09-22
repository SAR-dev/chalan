"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PayoutRequest } from "@/lib/types"

interface RejectPayoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PayoutRequest | null
  reason: string
  onReasonChange: (reason: string) => void
  onConfirm: () => void
  loading?: boolean
}

export function RejectPayoutDialog({
  open,
  onOpenChange,
  target,
  reason,
  onReasonChange,
  onConfirm,
  loading,
}: RejectPayoutDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onReasonChange("")
        }
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject payout {target?.id}</DialogTitle>
          <DialogDescription>
            The {target?.id} request will be rejected and its orders unlocked so
            the merchant can request payout again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g. Account details do not match the registered merchant."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onReasonChange("")
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!reason.trim() || loading}
          >
            Reject request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
