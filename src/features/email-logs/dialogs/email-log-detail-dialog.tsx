"use client"

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  User,
} from "lucide-react"
import { FormDialog } from "@/components/form-dialog"
import { Badge } from "@/components/ui/badge"
import { useEmailLog } from "@/features/email-logs/hooks/use-email-logs"
import {
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_LOG_STATUS_TONES,
} from "@/lib/constants"
import type { EmailLogListItem } from "@/lib/types"

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface EmailLogDetailDialogProps {
  log: EmailLogListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EmailLogDetailDialog({
  log,
  open,
  onOpenChange,
}: EmailLogDetailDialogProps) {
  // The list rows omit the HTML/plain-text bodies (they are the bulk of the
  // payload), so the preview is fetched here when the dialog opens.
  const { log: detail, isLoading: detailLoading } = useEmailLog(
    open ? (log?.id ?? null) : null,
  )
  const body = detail?.body
  const textBody = detail?.textBody

  if (!log) return null

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Email log details"
      description={log.subject}
      size="lg"
      showCancel={false}
      submitLabel="Close"
      onConfirm={() => onOpenChange(false)}
      fullWidthButtons
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Clock className="text-muted-foreground size-4 shrink-0" />
          <span>{formatTimestamp(log.createdAt)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Mail className="text-muted-foreground size-4 shrink-0" />
          <span className="break-all">{log.to}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="text-muted-foreground size-4 shrink-0" />
          <Badge
            variant="secondary"
            className={`font-normal ${
              EMAIL_LOG_STATUS_TONES[log.status] === "success"
                ? "bg-chart-2/15 text-chart-2"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            {EMAIL_LOG_STATUS_LABELS[log.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Clock className="text-muted-foreground size-4 shrink-0" />
          <span>
            {log.attempts} attempt{log.attempts !== 1 ? "s" : ""}
          </span>
        </div>
        {log.markedSentBy ? (
          <div className="flex items-center gap-3 text-sm">
            <User className="text-muted-foreground size-4 shrink-0" />
            <span>
              Marked sent by {log.markedSentBy}
              {log.markedSentAt
                ? ` on ${formatTimestamp(log.markedSentAt)}`
                : ""}
            </span>
          </div>
        ) : null}
        {log.error ? (
          <div className="flex items-start gap-3 text-sm">
            <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
            <span className="text-destructive break-all">{log.error}</span>
          </div>
        ) : null}
      </div>

      {detailLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading email preview…</span>
        </div>
      ) : null}

      {body ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium uppercase">
            Email preview
          </span>
          <div className="bg-muted border-input max-h-80 overflow-y-auto rounded-md border">
            <iframe
              srcDoc={body}
              title="Email preview"
              sandbox="allow-same-origin"
              className="h-80 w-full border-0"
            />
          </div>
        </div>
      ) : null}

      {textBody ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium uppercase">
            Plain text
          </span>
          <pre className="bg-muted border-input max-h-60 overflow-y-auto rounded-md border p-3 text-sm whitespace-pre-wrap">
            {textBody}
          </pre>
        </div>
      ) : null}
    </FormDialog>
  )
}
