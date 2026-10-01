import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DataTableCsv } from "./types"

interface TableFooterProps<T> {
  paginated: boolean
  from: number
  to: number
  serverPaginated: boolean
  serverTotal?: number
  sortedLength: number
  displayTotal: number
  pageSizeOptions?: number[]
  size: number
  page: number
  totalPages: number
  currentPage: number
  onPageChange?: (page: number, limit: number) => void
  userChangedSize: { current: boolean }
  setSize: (size: number) => void
  setPage: (page: number) => void
  refreshing: boolean
  setRefreshing: (refreshing: boolean) => void
  onRefresh?: () => void
  id?: string
  setSettingsOpen: (open: boolean) => void
  csv?: DataTableCsv<T>
  handleDownloadCsv: () => void
}

export function TableFooter<T>({
  paginated,
  from,
  to,
  serverPaginated,
  serverTotal,
  sortedLength,
  displayTotal,
  pageSizeOptions,
  size,
  page,
  totalPages,
  currentPage,
  onPageChange,
  userChangedSize,
  setSize,
  setPage,
  refreshing,
  setRefreshing,
  onRefresh,
  id,
  setSettingsOpen,
  csv,
  handleDownloadCsv,
}: TableFooterProps<T>) {
  return (
    <div className="border-border flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        {paginated ? (
          <>
            <span className="text-muted-foreground tabular-nums">
              {from}–{to} of{" "}
              {serverPaginated ? (serverTotal ?? 0) : sortedLength}
            </span>
            {pageSizeOptions && pageSizeOptions.length > 0 ? (
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Rows per page</span>
                <select
                  data-testid={id ? `table-page-size-${id}` : undefined}
                  value={size}
                  onChange={(e) => {
                    const newSize = Number(e.target.value)
                    if (serverPaginated && onPageChange) {
                      onPageChange(1, newSize)
                    } else {
                      userChangedSize.current = true
                      setSize(newSize)
                      setPage(1)
                    }
                  }}
                  className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-sm"
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt} / page
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span
              data-testid={id ? `table-page-label-${id}` : undefined}
              className="text-muted-foreground tabular-nums"
            >
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                data-testid={id ? `table-prev-${id}` : undefined}
                onClick={() => {
                  const newPage = Math.max(1, page - 1)
                  if (serverPaginated && onPageChange) {
                    onPageChange(newPage, size)
                  } else {
                    setPage(newPage)
                  }
                }}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                data-testid={id ? `table-next-${id}` : undefined}
                onClick={() => {
                  const newPage = Math.min(totalPages, page + 1)
                  if (serverPaginated && onPageChange) {
                    onPageChange(newPage, size)
                  } else {
                    setPage(newPage)
                  }
                }}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {displayTotal} record{displayTotal === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          data-testid={id ? `table-refresh-${id}` : undefined}
          disabled={refreshing}
          onClick={async () => {
            if (refreshing) return
            setRefreshing(true)
            try {
              await Promise.all([
                Promise.resolve(onRefresh?.()),
                new Promise((r) => setTimeout(r, 400)),
              ])
            } finally {
              setRefreshing(false)
            }
          }}
          aria-label="Refresh table"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </Button>
        {id ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            data-testid={id ? `table-settings-${id}` : undefined}
            onClick={() => setSettingsOpen(true)}
            aria-label="Table settings"
          >
            <Settings className="size-4" />
          </Button>
        ) : null}
        {csv ? (
          <Button
            type="button"
            variant="outline"
            data-testid={id ? `table-csv-${id}` : undefined}
            onClick={handleDownloadCsv}
            disabled={!csv.downloadUrl && !csv.parser}
            className="gap-1.5"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Download CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
