"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { Merchant } from "@/lib/types"

interface RejectNidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchant: Merchant | null
  reason: string
  onReasonChange: (reason: string) => void
  onConfirm: () => void
  loading?: boolean
}

export function RejectNidDialog({
  open,
  onOpenChange,
  merchant,
  reason,
  onReasonChange,
  onConfirm,
  loading,
}: RejectNidDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject NID</DialogTitle>
          <DialogDescription>
            Reject NID for {merchant?.businessName}? They will need to
            re-upload.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-4">
          <label htmlFor="reject-nid-reason" className="text-sm font-medium">
            Rejection reason
          </label>
          <Textarea
            id="reject-nid-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Enter the reason for rejection..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading || !reason.trim()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
