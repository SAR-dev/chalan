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
import type { PackageRequestRow } from "@/features/packages/hooks/use-package-requests"
import { formatTk } from "@/lib/pricing"

interface RejectRequestDialogProps {
  target: PackageRequestRow | null
  reason: string
  onReasonChange: (reason: string) => void
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  loading?: boolean
}

/** Destructive action: the merchant has to be told why before we decline. */
export function RejectRequestDialog({
  target,
  reason,
  onReasonChange,
  onOpenChange,
  onConfirm,
  loading,
}: RejectRequestDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) onReasonChange("")
        onOpenChange(o)
      }}
    >
      <DialogContent data-testid="reject-request-dialog">
        <DialogHeader>
          <DialogTitle>Reject package request</DialogTitle>
          <DialogDescription>
            {target?.merchantName} paid {target ? formatTk(target.amount) : ""}{" "}
            for {target?.packageName}. Declining leaves the bundle inactive and
            the reason below is shown to the merchant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-request-reason">Reason</Label>
          <Textarea
            id="reject-request-reason"
            data-testid="request-reject-reason-input"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g. The bKash transaction ID could not be verified."
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            data-testid="request-reject-cancel"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="request-reject-confirm"
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
