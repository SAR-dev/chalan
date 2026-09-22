"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDataError } from "@/lib/hooks/use-data-error"

// Renders only when the platform data load failed. Lets the user retry the
// fetch in place so the app degrades gracefully instead of showing empty data.
// When `keys` is provided, only those resource endpoints are monitored.
export function DataErrorBanner({ keys }: { keys?: readonly string[] }) {
  const { dataError, refreshData } = useDataError(keys)

  if (!dataError) return null

  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 mb-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-destructive font-medium">
            Couldn&apos;t load the latest data
          </p>
          <p className="text-muted-foreground text-sm">{dataError}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={refreshData}
        className="shrink-0 self-start sm:self-auto"
      >
        <RefreshCw className="size-4" />
        Retry
      </Button>
    </div>
  )
}
