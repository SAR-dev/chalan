"use client"

import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  ResolvedRow,
  ResolveLookups,
} from "@/features/orders/bulk-import/resolve-rows"
import type { OrderImportHeader } from "@/features/orders/bulk-import/template"
import type { ImportPhase } from "../types"
import { ImportPreviewTable } from "./import-preview-table"

interface ImportPreviewCardProps {
  phase: ImportPhase
  rows: ResolvedRow[]
  serverErrors: Record<number, string[]>
  summary: string
  validCount: number
  errorCount: number
  showConfirm: boolean
  confirmDisabled: boolean
  lookups: ResolveLookups
  onCellChange: (line: number, field: OrderImportHeader, value: string) => void
  onErrorCsvDownload: () => void
  onConfirm: () => void
  onCancel: () => void
}

export function ImportPreviewCard({
  phase,
  rows,
  serverErrors,
  summary,
  validCount,
  errorCount,
  showConfirm,
  confirmDisabled,
  lookups,
  onCellChange,
  onErrorCsvDownload,
  onConfirm,
  onCancel,
}: ImportPreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          Click any cell to fix it in place — validation and the counts update
          as you type.
        </CardDescription>
        <CardAction>
          <p data-testid="bulk-import-summary" className="text-sm font-medium">
            {summary}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ImportPreviewTable
          rows={rows}
          serverErrors={serverErrors}
          lookups={lookups}
          onCellChange={onCellChange}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {errorCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              data-testid="bulk-import-error-export"
              onClick={onErrorCsvDownload}
            >
              <Download className="size-4" />
              Download error CSV
            </Button>
          ) : null}
          {showConfirm ? (
            <Button
              type="button"
              data-testid="bulk-import-confirm"
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {phase === "submitting" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Import {validCount} order{validCount === 1 ? "" : "s"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            data-testid="bulk-import-cancel"
            disabled={phase === "submitting"}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
