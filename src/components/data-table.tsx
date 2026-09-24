"use client"

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react"
import * as React from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTableEmpty } from "@/components/data-table-empty"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/features/account/hooks/use-auth"
import {
  DEFAULT_TABLE_ROWS_PER_PAGE,
  MAX_TABLE_ROWS_PER_PAGE,
} from "@/lib/constants"
import { downloadCsv, toCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"

type Align = "left" | "right" | "center"

export interface DataTableColumn<T> {
  /** Stable identifier, also used as the sort key. */
  id: string
  /** Header label (string or custom node). */
  header: React.ReactNode
  /** Renders the cell body for a given row. */
  cell: (row: T) => React.ReactNode
  /** Enable click-to-sort on this column. Requires `sortValue` (or falls back to the cell value if it's primitive). */
  sortable?: boolean
  /** Value used when sorting this column. */
  sortValue?: (row: T) => string | number | boolean | null | undefined
  /** Text alignment for header + cells. Defaults to "left". */
  align?: Align
  /** Extra classes for the header cell. */
  headClassName?: string
  /** Extra classes for body cells. */
  cellClassName?: string
  /** When true, this column stays fixed during horizontal scroll. Sticky
   * columns are always displayed and cannot be hidden via the settings
   * dialog. Requires the table to have an `id` for the scroll container. */
  sticky?: boolean
}

export interface DataTableBulkAction<T> {
  label: string
  icon?: React.ReactNode
  variant?: "default" | "destructive" | "outline" | "secondary"
  disabled?: boolean
  onClick: (selectedRows: T[], clearSelection: () => void) => void
}

/** Enables a "Download CSV" toolbar button. `parser` is required for
 * client-side export; `downloadUrl` enables server-side streaming. */
export interface DataTableCsv<T> {
  /** Server-side CSV download URL. When provided, triggers a browser
   * download instead of client-side generation. Takes precedence over
   * `parser`. */
  downloadUrl?: string
  /** Converts one row into an array of cell values, in column order.
   * Required when `downloadUrl` is not set. */
  parser?: (row: T) => (string | number | null | undefined)[]
  /** Header row labels, in the same order as `parser`'s output. */
  headers?: string[]
  /** Filename without extension. Defaults to "export". */
  filename?: string
  /** Export all rows matching the current search/filter/sort ("all", the
   * default) or only the rows on the current page ("page"). */
  scope?: "all" | "page"
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  getRowKey: (row: T, index: number) => string
  /** Unique table identifier. When provided, column visibility is persisted
   * in localStorage and a settings button appears in the toolbar. */
  id?: string
  /** Enables client-side search within the table. When true, a search input
   * and column picker appear in the toolbar. Requires `getSearchValue`. */
  searchable?: boolean
  /** Explicit column IDs that should appear in the search column picker.
   * When provided, only these columns are searchable. When omitted, all
   * columns are searchable. */
  searchColumns?: string[]
  /** Function to extract searchable text from a row for a given column.
   * When omitted, falls back to `sortValue` for each column. Return
   * null/undefined to skip. */
  getSearchValue?: (row: T, columnId: string) => string | null | undefined
  /** Rows per page. Pass 0 to disable pagination. Defaults to the signed-in
   * account's saved rows-per-page preference (Account settings), or 20 if
   * unset/unauthenticated. An explicit prop always wins over the account
   * default. Clamped to 1-250 regardless of source. */
  pageSize?: number
  /** Selectable page sizes shown in the footer. */
  pageSizeOptions?: number[]
  /** Column id to sort by initially. */
  initialSortId?: string
  initialSortDir?: SortDir
  emptyMessage?: React.ReactNode
  onRowClick?: (row: T) => void
  className?: string
  /** Enables a "Download CSV" button in the toolbar. */
  csv?: DataTableCsv<T>
  /** Full dataset for CSV export when using server-side pagination.
   * When provided, `scope: "all"` exports from this array instead of
   * the paginated `data`. */
  csvData?: T[]
  /** Enable server-side pagination mode. Data is already the current page;
   * filtering, sorting, and pagination are handled by the parent. */
  serverPaginated?: boolean
  /** Total row count from the API (required when serverPaginated is true). */
  total?: number
  /** Show loading state. */
  loading?: boolean
  /** Controlled search query (server mode). */
  query?: string
  /** Called when the user types in the search box (server mode). */
  onQueryChange?: (query: string) => void
  /** Controlled sort state (server mode). */
  serverSortId?: string
  serverSortDir?: SortDir
  /** Called when the user clicks a sortable column header (server mode). */
  onSortChange?: (sortId: string, sortDir: SortDir) => void
  /** Called when the user changes page or page size (server mode). */
  onPageChange?: (page: number, limit: number) => void
  /** Controlled selected row keys. When provided, selection is fully
   * controlled by the parent. */
  selectedKeys?: Set<string>
  /** Called when selection changes. */
  onSelectionChange?: (keys: Set<string>) => void
  /** Action buttons shown in the selection toolbar. When provided and
   * non-empty, row checkboxes are shown automatically. */
  bulkActions?: DataTableBulkAction<T>[]
  /** Show loading state during bulk action execution. Disables bulk
   * buttons and replaces table rows with a spinner. */
  bulkLoading?: boolean
  /** Column IDs to pin to the left side of the table. Pinned columns
   * remain fixed during horizontal scroll, are always visible, and
   * cannot be hidden via the settings dialog. Applied in the order
   * given. */
  pinnedColumns?: string[]
  /** Called when the user clicks the refresh button. */
  onRefresh?: () => void
  /** Content rendered on the left side of the toolbar row, next to the
   * search bar. Use for QuickFilters or other filter controls. */
  toolbarLeft?: React.ReactNode
}

type SortDir = "asc" | "desc"

/**
 * Renders text content with truncation and a native tooltip on hover.
 * Use for single-line cell values that may overflow.
 */
export function CellContent({
  children,
  title,
  className,
}: {
  children: React.ReactNode
  /** Explicit tooltip text. Falls back to the text content if omitted. */
  title?: string
  className?: string
}) {
  const text = typeof children === "string" ? children : undefined
  return (
    <span title={title ?? text} className={cn("block truncate", className)}>
      {children}
    </span>
  )
}

/**
 * Renders a two-row cell: primary line (default color) + secondary line
 * (muted). Long text is truncated with a native tooltip on hover.
 */
export function CellTwoRow({
  primary,
  secondary,
  title,
}: {
  primary: React.ReactNode
  secondary?: React.ReactNode
  /** Tooltip for the primary line. Falls back to its text content. */
  title?: string
}) {
  const primaryText = typeof primary === "string" ? primary : undefined
  return (
    <div className="flex flex-col gap-0.5">
      <span title={title ?? primaryText} className="block truncate">
        {primary}
      </span>
      {secondary != null ? (
        <span className="text-muted-foreground block truncate">
          {secondary}
        </span>
      ) : null}
    </div>
  )
}

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

const justifyClass: Record<Align, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
}

const MIN_VISIBLE_COLUMNS = 2

// Sticky cells need an opaque background to hide content scrolling behind
// them. Header cells stay flat; body cells also pick up the row's
// hover/selected shading via `group-hover/row` since `group/row` is applied
// on TableRow (an inline background here would win over those classes
// instead, which is what broke this before).
const stickyHeadClass = "bg-background"
const stickyCellClass = "bg-background group-hover/row:bg-muted/50"
// Divider marking the edge of the pinned column area, shown once the table
// has been scrolled horizontally.
const pinnedEdgeClass =
  "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:shadow-[2px_0_6px_-2px_rgb(0_0_0_/_0.15)] after:content-['']"
// Left-edge divider for the first pinned column, shown when the table has
// been scrolled horizontally (so content is visible to its left).
const pinnedLeftEdgeClass =
  "after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-border after:shadow-[-2px_0_6px_-2px_rgb(0_0_0_/_0.15)] after:content-['']"

function storageKey(id: string) {
  return `datatable-columns:${id}`
}

function readVisibleFromStorage(id: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed
    }
  } catch {
    // ignored
  }
  return null
}

function writeVisibleToStorage(id: string, visible: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(visible))
  } catch {
    // ignored
  }
}

function searchColumnsKey(id: string) {
  return `datatable-search-columns:${id}`
}

function readSearchColumnsFromStorage(id: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(searchColumnsKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed
    }
  } catch {
    // ignored
  }
  return null
}

function writeSearchColumnsToStorage(id: string, columns: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(searchColumnsKey(id), JSON.stringify(columns))
  } catch {
    // ignored
  }
}

/** Clamps a possibly-missing/invalid rows-per-page value to [1, 250],
 * falling back to `fallback` (itself assumed already in range) when the
 * input is missing, not an integer, or out of bounds. `0` is left as-is
 * since it's the documented "disable pagination" sentinel, not a clamp
 * target. */
function clampPageSize(value: number | undefined | null, fallback: number) {
  if (value === 0) return 0
  if (
    value === undefined ||
    value === null ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return fallback
  }
  return Math.min(value, MAX_TABLE_ROWS_PER_PAGE)
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  id,
  searchable,
  searchColumns,
  getSearchValue,
  pageSize,
  pageSizeOptions,
  initialSortId,
  initialSortDir = "asc",
  emptyMessage = "No records to display.",
  onRowClick,
  className,
  csv,
  csvData,
  serverPaginated = false,
  total: serverTotal,
  loading = false,
  query: controlledQuery,
  onQueryChange,
  serverSortId,
  serverSortDir,
  onSortChange,
  onPageChange,
  selectedKeys,
  onSelectionChange,
  bulkActions,
  bulkLoading = false,
  pinnedColumns,
  onRefresh,
  toolbarLeft,
}: DataTableProps<T>) {
  const { currentUser } = useAuth()

  const selectable = bulkActions !== undefined && bulkActions.length > 0

  // Effective default when the caller doesn't pass an explicit `pageSize`:
  // the signed-in account's saved preference, clamped to 1-250, falling back
  // to DEFAULT_TABLE_ROWS_PER_PAGE (20) if unset or out of range.
  const accountDefault = clampPageSize(
    currentUser?.tableRowsPerPage,
    DEFAULT_TABLE_ROWS_PER_PAGE,
  )
  const effectivePageSize =
    pageSize !== undefined
      ? clampPageSize(pageSize, accountDefault)
      : accountDefault

  const [sortId, setSortId] = React.useState<string | null>(
    initialSortId ?? null,
  )
  const [sortDir, setSortDir] = React.useState<SortDir>(initialSortDir)
  const [size, setSize] = React.useState(effectivePageSize)
  const [page, setPage] = React.useState(1)
  const paginated = size > 0
  const [refreshing, setRefreshing] = React.useState(false)

  const allColumnIds = React.useMemo(() => columns.map((c) => c.id), [columns])
  const stickyColumnIds = React.useMemo(
    () => columns.filter((c) => c.sticky).map((c) => c.id),
    [columns],
  )
  const pinnedColumnIds = React.useMemo(
    () => (pinnedColumns ?? []).filter((cid) => allColumnIds.includes(cid)),
    [pinnedColumns, allColumnIds],
  )
  const pinnedColumnSet = React.useMemo(
    () => new Set(pinnedColumnIds),
    [pinnedColumnIds],
  )
  const firstPinnedColumnId =
    pinnedColumnIds.length > 0 ? pinnedColumnIds[0] : null
  // The last pinned column (or the select checkbox column if there are no
  // sticky data columns) is where the "end of pinned area" divider goes.
  const lastStickyColumnId =
    stickyColumnIds.length > 0
      ? stickyColumnIds[stickyColumnIds.length - 1]
      : selectable
        ? "__select__"
        : null

  function resolveVisibleColumnIds(ids: string[]) {
    if (!id) return ids
    const saved = readVisibleFromStorage(id)
    let result: string[]
    if (saved) {
      const valid = saved.filter((cid) => ids.includes(cid))
      if (valid.length >= MIN_VISIBLE_COLUMNS) {
        result = valid
      } else {
        result = ids
      }
    } else {
      result = ids
    }
    // Always include sticky and pinned columns
    for (const sid of [...stickyColumnIds, ...pinnedColumnIds]) {
      if (!result.includes(sid)) result.push(sid)
    }
    return result
  }

  const [visibleColumnIds, setVisibleColumnIds] = React.useState<string[]>(() =>
    resolveVisibleColumnIds(allColumnIds),
  )

  // The id/columns signature visibleColumnIds was last resolved for. When a
  // caller swaps in a different column set under the *same* `id` (e.g. a
  // tab change that reuses one DataTable id with per-tab columns), the
  // available ids change but the lazy useState initializer above doesn't
  // re-run, so visibleColumnIds would stay stale and get intersected away
  // to nothing relevant. Re-resolve whenever the id or the set of available
  // column ids changes. (Uses state rather than a ref so the comparison is
  // safe to perform during render, per the rules of React.)
  const columnsSignature = `${id ?? ""}:${allColumnIds.join(",")}`
  const [lastSignature, setLastSignature] = React.useState(columnsSignature)
  if (lastSignature !== columnsSignature) {
    setLastSignature(columnsSignature)
    setVisibleColumnIds(resolveVisibleColumnIds(allColumnIds))
  }

  const [settingsOpen, setSettingsOpen] = React.useState(false)

  // Sticky column positioning.
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const stickyPositionsRef = React.useRef<Map<string, number>>(new Map())
  const [isPinnedScrolled, setIsPinnedScrolled] = React.useState(false)

  const applyStickyOffsets = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    if (stickyColumnIds.length === 0 && pinnedColumnIds.length === 0) {
      setIsPinnedScrolled(container.scrollLeft > 0)
      return
    }

    // Checkbox column: sticky-left
    const selectEl = container.querySelector<HTMLElement>(
      '[data-sticky-col="__select__"]',
    )
    if (selectEl) {
      selectEl.style.position = "sticky"
      selectEl.style.left = "0px"
      selectEl.style.zIndex = "3"
      selectEl.style.background = "var(--background)"
      container
        .querySelectorAll<HTMLElement>('[data-sticky-cell="__select__"]')
        .forEach((cell) => {
          cell.style.position = "sticky"
          cell.style.left = "0px"
          cell.style.zIndex = "2"
          cell.style.background = "var(--background)"
        })
    }

    // Pinned columns: sticky-left (cumulative left offset after checkbox)
    const selectWidth = selectEl ? selectEl.offsetWidth : 0
    let cumulativeLeft = selectWidth
    for (const cid of pinnedColumnIds) {
      const header = container.querySelector<HTMLElement>(
        `[data-sticky-col="${cid}"]`,
      )
      if (!header) continue

      header.style.position = "sticky"
      header.style.left = `${cumulativeLeft}px`
      header.style.right = "auto"
      header.style.zIndex = "3"
      header.style.background = "var(--background)"
      stickyPositionsRef.current.set(cid, cumulativeLeft)

      container
        .querySelectorAll<HTMLElement>(`[data-sticky-cell="${cid}"]`)
        .forEach((cell) => {
          cell.style.position = "sticky"
          cell.style.left = `${cumulativeLeft}px`
          cell.style.right = "auto"
          cell.style.zIndex = "2"
          cell.style.background = "var(--background)"
        })

      cumulativeLeft += header.offsetWidth
    }

    // Right-side sticky columns (action menus): sticky-right (process in
    // reverse so the rightmost column sticks at `right: 0`, the next one
    // sticks just to its left, etc.)
    const reversed = [...stickyColumnIds].reverse()
    let cumulativeRight = 0
    for (const cid of reversed) {
      const header = container.querySelector<HTMLElement>(
        `[data-sticky-col="${cid}"]`,
      )
      if (!header) continue

      header.style.position = "sticky"
      header.style.left = "auto"
      header.style.right = `${cumulativeRight}px`
      header.style.zIndex = "3"
      header.style.background = "var(--background)"
      stickyPositionsRef.current.set(cid, cumulativeRight)

      container
        .querySelectorAll<HTMLElement>(`[data-sticky-cell="${cid}"]`)
        .forEach((cell) => {
          cell.style.position = "sticky"
          cell.style.left = "auto"
          cell.style.right = `${cumulativeRight}px`
          cell.style.zIndex = "2"
          cell.style.background = "var(--background)"
        })

      cumulativeRight += header.offsetWidth
    }

    setIsPinnedScrolled(container.scrollLeft > 0)
  }, [stickyColumnIds, pinnedColumnIds])

  // Recompute on every render (covers data/column/width changes triggered by
  // React state), plus on container resize and horizontal scroll, since
  // those don't otherwise trigger a re-render.
  React.useLayoutEffect(() => {
    applyStickyOffsets()
  })

  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => applyStickyOffsets())
    observer.observe(container)
    return () => observer.disconnect()
  }, [applyStickyOffsets])

  const filteredColumns = React.useMemo(() => {
    const visible = visibleColumnIds.filter((cid) => allColumnIds.includes(cid))
    // Always include sticky and pinned columns regardless of visibility settings
    const final = new Set([...stickyColumnIds, ...pinnedColumnIds, ...visible])
    if (final.size >= MIN_VISIBLE_COLUMNS) {
      return columns.filter((c) => final.has(c.id))
    }
    return columns
  }, [
    columns,
    visibleColumnIds,
    allColumnIds,
    stickyColumnIds,
    pinnedColumnIds,
  ])

  function toggleColumn(columnId: string) {
    // Sticky and pinned columns cannot be hidden
    if (columns.find((c) => c.id === columnId)?.sticky) return
    if (pinnedColumnIds.includes(columnId)) return
    setVisibleColumnIds((prev) => {
      const isOn = prev.includes(columnId)
      const nonStickyCount = prev.filter(
        (cid) =>
          !stickyColumnIds.includes(cid) && !pinnedColumnIds.includes(cid),
      ).length
      if (isOn && nonStickyCount <= MIN_VISIBLE_COLUMNS) return prev
      const next = isOn
        ? prev.filter((cid) => cid !== columnId)
        : [...prev, columnId]
      if (id) writeVisibleToStorage(id, next)
      return next
    })
  }

  // ---- Client-side search ----
  const [searchQuery, setSearchQuery] = React.useState("")
  const [filterOpen, setFilterOpen] = React.useState(false)

  // All searchable column IDs — use explicit list when provided, otherwise all columns
  const allSearchableIds = React.useMemo(
    () => searchColumns ?? columns.map((c) => c.id),
    [searchColumns, columns],
  )

  const [searchColumnIds, setSearchColumnIds] = React.useState<string[]>(() => {
    if (!id || !searchable) return allSearchableIds
    const saved = readSearchColumnsFromStorage(id)
    if (saved) {
      const valid = saved.filter((cid) => allSearchableIds.includes(cid))
      if (valid.length > 0) return valid
    }
    return allSearchableIds
  })

  function toggleSearchColumn(columnId: string) {
    setSearchColumnIds((prev) => {
      const isOn = prev.includes(columnId)
      if (isOn && prev.length <= 1) return prev
      const next = isOn
        ? prev.filter((cid) => cid !== columnId)
        : [...prev, columnId]
      if (id) writeSearchColumnsToStorage(id, next)
      return next
    })
  }

  const trimmedSearch = searchQuery.trim().toLowerCase()

  // The account's preference loads asynchronously (it comes from the same
  // session bootstrap as `currentUser`), so it's often not ready yet on first
  // render. Adopt it once it arrives — but only when the caller didn't pass
  // an explicit `pageSize` and the person hasn't already changed the page
  // size in this table (via the selector below), so we never clobber either
  // an explicit prop or a deliberate in-session choice.
  const userChangedSize = React.useRef(false)
  React.useEffect(() => {
    if (pageSize === undefined && !userChangedSize.current) {
      setSize(effectivePageSize)
    }
  }, [effectivePageSize, pageSize])

  const filtered = React.useMemo(() => {
    if (serverPaginated) return data
    if (!trimmedSearch || !searchable) return data
    return data.filter((row) =>
      searchColumnIds.some((cid) => {
        let val: string | null | undefined
        if (getSearchValue) {
          val = getSearchValue(row, cid)
        } else {
          const col = columns.find((c) => c.id === cid)
          val = col?.sortValue ? String(col.sortValue(row) ?? "") : null
        }
        return val != null && String(val).toLowerCase().includes(trimmedSearch)
      }),
    )
  }, [
    data,
    trimmedSearch,
    searchable,
    getSearchValue,
    searchColumnIds,
    columns,
    serverPaginated,
  ])

  const sorted = React.useMemo(() => {
    if (serverPaginated) return data
    if (!sortId) return filtered
    const col = columns.find((c) => c.id === sortId)
    if (!col?.sortValue) return filtered
    const getVal = col.sortValue
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      let result: number
      if (typeof av === "number" && typeof bv === "number") {
        result = av - bv
      } else {
        result = String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      }
      return sortDir === "asc" ? result : -result
    })
    return copy
  }, [filtered, columns, sortId, sortDir, serverPaginated, data])

  const totalPages = paginated
    ? Math.max(
        1,
        Math.ceil(
          (serverPaginated ? (serverTotal ?? 0) : sorted.length) / size,
        ),
      )
    : 1

  // Clamp page during render — avoids the extra render cycle that
  // setState-in-effect causes. Page resets to 1 when query/filters change
  // because totalPages changes, which clamps down naturally.
  const currentPage = Math.min(Math.max(1, page), totalPages)

  const visible = React.useMemo(() => {
    if (serverPaginated) return data
    if (!paginated) return sorted
    const start = (currentPage - 1) * size
    return sorted.slice(start, start + size)
  }, [sorted, currentPage, size, paginated, serverPaginated, data])

  // ---- Selection ----
  const [internalSelectedKeys, setInternalSelectedKeys] = React.useState<
    Set<string>
  >(new Set<string>())
  const resolvedSelectedKeys = selectedKeys ?? internalSelectedKeys

  // ---- Bulk action confirmation ----
  const [pendingBulkAction, setPendingBulkAction] = React.useState<{
    action: DataTableBulkAction<T>
    rows: T[]
  } | null>(null)

  function updateSelection(keys: Set<string>) {
    if (selectedKeys === undefined) setInternalSelectedKeys(keys)
    onSelectionChange?.(keys)
  }

  const selectedCount = resolvedSelectedKeys.size

  const visibleKeys = React.useMemo(
    () => visible.map((row, i) => getRowKey(row, i)),
    [visible, getRowKey],
  )

  const visibleSelectedCount = visibleKeys.filter((k) =>
    resolvedSelectedKeys.has(k),
  ).length
  const allVisibleSelected =
    visible.length > 0 && visibleSelectedCount === visible.length
  const someVisibleSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visible.length

  const selectAllRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  React.useEffect(() => {
    if (!loading) setRefreshing(false)
  }, [loading])

  function handleSelectAll() {
    if (allVisibleSelected) {
      const next = new Set<string>(resolvedSelectedKeys)
      visibleKeys.forEach((k) => next.delete(k))
      updateSelection(next)
    } else {
      const next = new Set<string>(resolvedSelectedKeys)
      visibleKeys.forEach((k) => next.add(k))
      updateSelection(next)
    }
  }

  function handleSelectOne(key: string) {
    const next = new Set<string>(resolvedSelectedKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    updateSelection(next)
  }

  function clearSelection() {
    updateSelection(new Set<string>())
  }

  function handleBulkAction(action: DataTableBulkAction<T>) {
    const selectedRows = data.filter((row, i) =>
      resolvedSelectedKeys.has(getRowKey(row, i)),
    )
    setPendingBulkAction({ action, rows: selectedRows })
  }

  function executePendingBulkAction() {
    if (!pendingBulkAction) return
    pendingBulkAction.action.onClick(pendingBulkAction.rows, clearSelection)
    setPendingBulkAction(null)
  }

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable || !col.sortValue) return
    if (serverPaginated && onSortChange) {
      const currentId = serverSortId
      const currentDir = serverSortDir ?? "asc"
      if (currentId !== col.id) {
        onSortChange(col.id, "asc")
      } else if (currentDir === "asc") {
        onSortChange(col.id, "desc")
      } else {
        onSortChange("", "asc")
      }
      setPage(1)
      return
    }
    if (sortId !== col.id) {
      setSortId(col.id)
      setSortDir("asc")
      setPage(1)
      return
    }
    // Cycle: asc -> desc -> unsorted
    if (sortDir === "asc") {
      setSortDir("desc")
    } else {
      setSortId(null)
      setSortDir("asc")
    }
    setPage(1)
  }

  function handleDownloadCsv() {
    if (!csv) return
    if (csv.downloadUrl) {
      window.open(csv.downloadUrl, "_blank")
      return
    }
    if (!csv.parser) return
    const source = csvData ?? (csv.scope === "page" ? visible : sorted)
    const content = toCsv(source.map(csv.parser), csv.headers)
    downloadCsv(csv.filename ?? "export", content)
  }

  const displayTotal = serverPaginated ? (serverTotal ?? 0) : sorted.length
  const from = displayTotal === 0 ? 0 : (currentPage - 1) * size + 1
  const to = paginated
    ? Math.min(currentPage * size, displayTotal)
    : displayTotal

  return (
    <div className={cn("flex flex-col", className)}>
      {searchable ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {toolbarLeft ? <div className="mr-auto">{toolbarLeft}</div> : null}
          <div className="relative min-w-0 flex-1 sm:flex-initial">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              data-testid={id ? `table-search-${id}` : undefined}
              aria-label="Search"
              placeholder="Search..."
              value={serverPaginated ? (controlledQuery ?? "") : searchQuery}
              onChange={(e) => {
                if (serverPaginated) {
                  onQueryChange?.(e.target.value)
                } else {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }
              }}
              className="h-8 w-full pl-9 text-sm sm:w-64"
            />
          </div>
          {id ? (
            <Button
              type="button"
              variant={
                searchColumnIds.length < allSearchableIds.length
                  ? "secondary"
                  : "outline"
              }
              size="icon"
              className="size-8"
              onClick={() => setFilterOpen(true)}
              aria-label="Filter search columns"
            >
              <Filter className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {selectable && selectedCount > 0 ? (
        <div className="border-border flex flex-wrap items-center gap-2 border-y px-4 py-2">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions?.map((action) => {
              return (
                <Button
                  key={action.label}
                  variant={action.variant ?? "default"}
                  size="sm"
                  disabled={action.disabled || bulkLoading}
                  onClick={() => handleBulkAction(action)}
                >
                  {action.icon}
                  {action.label}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-auto"
        onScroll={(e) => setIsPinnedScrolled(e.currentTarget.scrollLeft > 0)}
      >
        {bulkLoading || refreshing ? (
          <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center">
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
          </div>
        ) : null}
        <Table data-testid={id ? `table-${id}` : undefined}>
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead
                  className={cn(
                    "relative w-10",
                    stickyHeadClass,
                    isPinnedScrolled &&
                      lastStickyColumnId === "__select__" &&
                      pinnedEdgeClass,
                  )}
                  data-sticky-col="__select__"
                  aria-hidden="true"
                >
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected && visible.length > 0}
                    onChange={handleSelectAll}
                    className="size-4 cursor-pointer"
                    aria-label={
                      allVisibleSelected
                        ? "Deselect all rows"
                        : "Select all rows"
                    }
                  />
                </TableHead>
              ) : null}
              {filteredColumns.map((col) => {
                const align = col.align ?? "left"
                const effectiveSortId = serverPaginated ? serverSortId : sortId
                const effectiveSortDir = serverPaginated
                  ? (serverSortDir ?? "asc")
                  : sortDir
                const isSorted = effectiveSortId === col.id
                const canSort = Boolean(col.sortable && col.sortValue)
                return (
                  <TableHead
                    key={col.id}
                    className={cn(
                      "relative",
                      alignClass[align],
                      col.headClassName,
                      (col.sticky || pinnedColumnSet.has(col.id)) &&
                        stickyHeadClass,
                      col.sticky &&
                        isPinnedScrolled &&
                        lastStickyColumnId === col.id &&
                        pinnedEdgeClass,
                      pinnedColumnSet.has(col.id) &&
                        isPinnedScrolled &&
                        firstPinnedColumnId === col.id &&
                        pinnedLeftEdgeClass,
                    )}
                    {...(col.sticky || pinnedColumnSet.has(col.id)
                      ? ({
                          "data-sticky-col": col.id,
                        } as Record<string, string>)
                      : undefined)}
                    aria-sort={
                      isSorted
                        ? effectiveSortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium transition-colors select-none",
                          isSorted
                            ? "text-foreground"
                            : "text-muted-foreground",
                          justifyClass[align],
                        )}
                      >
                        {col.header}
                        {isSorted ? (
                          effectiveSortDir === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !bulkLoading ? (
              Array.from({ length: size || 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {selectable ? (
                    <TableCell
                      className={cn("w-10", stickyCellClass)}
                      data-sticky-cell="__select__"
                    >
                      <div className="size-4" />
                    </TableCell>
                  ) : null}
                  {filteredColumns.map((col, colIndex) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        (col.sticky || pinnedColumnSet.has(col.id)) &&
                          stickyCellClass,
                      )}
                      {...(col.sticky || pinnedColumnSet.has(col.id)
                        ? ({
                            "data-sticky-cell": col.id,
                          } as Record<string, string>)
                        : undefined)}
                    >
                      <Skeleton
                        className={cn(
                          "h-4",
                          colIndex === 0
                            ? "w-3/4"
                            : colIndex === filteredColumns.length - 1
                              ? "w-1/2"
                              : "w-full",
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visible.length === 0 && !bulkLoading ? (
              <TableRow>
                <TableCell
                  colSpan={filteredColumns.length + (selectable ? 1 : 0)}
                  data-testid={id ? `table-empty-${id}` : undefined}
                  className="py-0"
                >
                  {typeof emptyMessage === "string" ? (
                    <DataTableEmpty title={emptyMessage} />
                  ) : (
                    <div className="text-muted-foreground py-10 text-center text-sm">
                      {emptyMessage}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row, index) => {
                const key = getRowKey(row, index)
                const isSelected = resolvedSelectedKeys.has(key)
                return (
                  <TableRow
                    key={key}
                    data-testid={id ? `row-${id}-${key}` : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "group/row",
                      onRowClick ? "cursor-pointer" : undefined,
                      selectable && isSelected ? "bg-muted/50" : undefined,
                    )}
                    aria-selected={selectable ? isSelected : undefined}
                  >
                    {selectable ? (
                      <TableCell
                        className={cn(
                          "relative w-10",
                          stickyCellClass,
                          isSelected && "bg-muted/50",
                          isPinnedScrolled &&
                            lastStickyColumnId === "__select__" &&
                            pinnedEdgeClass,
                        )}
                        data-sticky-cell="__select__"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(key)}
                          className="size-4 cursor-pointer"
                          aria-label="Select row"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                    ) : null}
                    {filteredColumns.map((col) => {
                      const align = col.align ?? "left"
                      return (
                        <TableCell
                          key={col.id}
                          data-testid={id ? `cell-${id}-${col.id}` : undefined}
                          className={cn(
                            "text-sm",
                            alignClass[align],
                            col.cellClassName,
                            (col.sticky || pinnedColumnSet.has(col.id)) &&
                              stickyCellClass,
                            (col.sticky || pinnedColumnSet.has(col.id)) &&
                              isSelected &&
                              "bg-muted/50",
                            col.sticky &&
                              isPinnedScrolled &&
                              lastStickyColumnId === col.id &&
                              pinnedEdgeClass,
                            pinnedColumnSet.has(col.id) &&
                              isPinnedScrolled &&
                              firstPinnedColumnId === col.id &&
                              pinnedLeftEdgeClass,
                          )}
                          {...(col.sticky || pinnedColumnSet.has(col.id)
                            ? ({
                                "data-sticky-cell": col.id,
                              } as Record<string, string>)
                            : undefined)}
                        >
                          {col.cell(row)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {paginated || id ? (
        <div className="border-border flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {paginated ? (
              <>
                <span className="text-muted-foreground tabular-nums">
                  {from}–{to} of{" "}
                  {serverPaginated ? (serverTotal ?? 0) : sorted.length}
                </span>
                {pageSizeOptions && pageSizeOptions.length > 0 ? (
                  <label className="flex items-center gap-1.5">
                    <span className="sr-only">Rows per page</span>
                    <select
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
                <span className="text-muted-foreground tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
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
              onClick={() => {
                setRefreshing(true)
                try {
                  onRefresh?.()
                } finally {
                  setRefreshing(false)
                }
              }}
              aria-label="Refresh table"
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
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
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadCsv}
              disabled={!csv || (!csv.downloadUrl && !csv.parser)}
              className="gap-1.5"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Download CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          </div>
        </div>
      ) : null}

      {id ? (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Table columns</DialogTitle>
              <DialogDescription>
                Choose which columns to display. Sticky and pinned columns are
                always visible.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              {columns.map((col) => {
                const isSticky = !!col.sticky
                const isPinned = pinnedColumnIds.includes(col.id)
                const isVisible = visibleColumnIds.includes(col.id)
                const nonStickyVisibleCount = visibleColumnIds.filter(
                  (cid) =>
                    !stickyColumnIds.includes(cid) &&
                    !pinnedColumnIds.includes(cid),
                ).length
                const isDisabled =
                  isSticky ||
                  isPinned ||
                  (isVisible && nonStickyVisibleCount <= MIN_VISIBLE_COLUMNS)
                return (
                  <label
                    key={col.id}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm",
                      isDisabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-muted/50 cursor-pointer",
                    )}
                  >
                    <span className="truncate">
                      {typeof col.header === "string" ? col.header : col.id}
                      {isSticky || isPinned ? (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({isPinned ? "pinned" : "sticky"})
                        </span>
                      ) : null}
                    </span>
                    <Switch
                      size="sm"
                      checked={isVisible}
                      disabled={isDisabled}
                      onCheckedChange={() => toggleColumn(col.id)}
                    />
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {searchable && id ? (
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Search columns</DialogTitle>
              <DialogDescription>
                Choose which columns to search. At least 1 must remain selected.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              {allSearchableIds.map((colId) => {
                const col = columns.find((c) => c.id === colId)
                if (!col) return null
                const isSearchable = searchColumnIds.includes(col.id)
                const isDisabled = isSearchable && searchColumnIds.length <= 1
                return (
                  <label
                    key={col.id}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm",
                      isDisabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-muted/50 cursor-pointer",
                    )}
                  >
                    <span className="truncate">
                      {typeof col.header === "string" ? col.header : col.id}
                    </span>
                    <Switch
                      size="sm"
                      checked={isSearchable}
                      disabled={isDisabled}
                      onCheckedChange={() => toggleSearchColumn(col.id)}
                    />
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFilterOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={pendingBulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={pendingBulkAction?.action.label ?? ""}
        description={`${pendingBulkAction?.rows.length ?? 0} items will be affected. Do you want to proceed?`}
        variant={
          pendingBulkAction?.action.variant === "destructive"
            ? "destructive"
            : "default"
        }
        confirmLabel={pendingBulkAction?.action.label}
        onConfirm={executePendingBulkAction}
      />
    </div>
  )
}
