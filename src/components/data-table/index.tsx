"use client"

import { ChevronDown, ChevronsUpDown, ChevronUp, Loader2 } from "lucide-react"
import * as React from "react"
import { DataTableEmpty } from "@/components/data-table-empty"
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
import {
  BulkActionConfirmDialog,
  BulkActionsBar,
  SelectAllHeadCell,
  SelectRowCell,
} from "./bulk-actions"
import {
  alignClass,
  justifyClass,
  pinnedEdgeClass,
  pinnedLeftEdgeClass,
  stickyCellClass,
  stickyHeadClass,
} from "./classes"
import {
  MIN_VISIBLE_COLUMNS,
  readSearchColumnsFromStorage,
  readVisibleFromStorage,
  writeSearchColumnsToStorage,
  writeVisibleToStorage,
} from "./column-visibility"
import { TableFooter } from "./pagination"
import { TableSkeletonRows } from "./skeleton"
import {
  ColumnSettingsDialog,
  DataTableToolbar,
  SearchColumnsDialog,
} from "./toolbar"
import type {
  DataTableBulkAction,
  DataTableColumn,
  DataTableCsv,
  DataTableProps,
  SortDir,
} from "./types"

export { CellContent, CellTwoRow } from "./cells"
export type {
  DataTableBulkAction,
  DataTableColumn,
  DataTableCsv,
} from "./types"

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

  // Explicit `csv` config always wins. Otherwise derive an export from the
  // rendered columns that carry a string header and a `sortValue` extractor,
  // so the footer button only appears when there is something to export.
  // `scope: "all"` sources from `sorted`: every row matching the current
  // search/filter (the loaded rows, when server-paginated — no new API
  // endpoints for the rest).
  const effectiveCsv = React.useMemo<DataTableCsv<T> | undefined>(() => {
    if (csv) return csv
    const exportable = filteredColumns.filter(
      (c) => typeof c.header === "string" && typeof c.sortValue === "function",
    )
    if (exportable.length === 0 || sorted.length === 0) return undefined
    return {
      headers: exportable.map((c) => c.header as string),
      parser: (row) =>
        exportable.map((c) => {
          const value = c.sortValue?.(row)
          return typeof value === "boolean" ? String(value) : value
        }),
      scope: "all",
      filename: id ?? "table-export",
    }
  }, [csv, filteredColumns, sorted, id])

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

  // In server mode the PARENT owns pagination: the footer hands control to
  // `onPageChange`, which updated the parent's state and never came back here,
  // so the footer's own `page` stayed at 1 — the label read "Page 1 of N" on
  // every server-paginated table and Previous was permanently disabled.
  // Found by the E2E spec added under ROADMAP R1.3, which is exactly why those
  // controls had no coverage.
  //
  // Advancing the local copy is safe because `visible` returns `data`
  // untouched when `serverPaginated` (L491) — this state is display-only here.
  const handlePageChange = React.useCallback(
    (nextPage: number, nextLimit: number) => {
      setPage(nextPage)
      onPageChange?.(nextPage, nextLimit)
    },
    [onPageChange],
  )

  const visible = React.useMemo(() => {
    if (serverPaginated) return data
    if (!paginated) return sorted
    const start = (currentPage - 1) * size
    return sorted.slice(start, start + size)
  }, [sorted, currentPage, size, paginated, serverPaginated, data])

  // A refresh must never blank the table. `loading` is true both for a genuine
  // first load (nothing to show yet) and for an in-flight refetch of a key
  // change, a post-mutation revalidate, or a manual refresh. Only the former
  // deserves skeleton rows — once rows exist they stay on screen behind the
  // overlay, because a table that empties and refills reads as data loss.
  const showSkeletonRows = loading && !bulkLoading && visible.length === 0
  const showRefreshOverlay =
    bulkLoading || refreshing || (loading && !bulkLoading && visible.length > 0)

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
    if (!effectiveCsv) return
    if (effectiveCsv.downloadUrl) {
      window.open(effectiveCsv.downloadUrl, "_blank")
      return
    }
    if (!effectiveCsv.parser) return
    const source = csvData ?? (effectiveCsv.scope === "page" ? visible : sorted)
    const content = toCsv(source.map(effectiveCsv.parser), effectiveCsv.headers)
    downloadCsv(effectiveCsv.filename ?? "export", content)
  }

  const displayTotal = serverPaginated ? (serverTotal ?? 0) : sorted.length
  const from = displayTotal === 0 ? 0 : (currentPage - 1) * size + 1
  const to = paginated
    ? Math.min(currentPage * size, displayTotal)
    : displayTotal

  return (
    <div className={cn("flex flex-col", className)}>
      {searchable ? (
        <DataTableToolbar
          toolbarLeft={toolbarLeft}
          id={id}
          serverPaginated={serverPaginated}
          controlledQuery={controlledQuery}
          searchQuery={searchQuery}
          onQueryChange={onQueryChange}
          setSearchQuery={setSearchQuery}
          setPage={setPage}
          searchColumnIds={searchColumnIds}
          allSearchableIds={allSearchableIds}
          setFilterOpen={setFilterOpen}
        />
      ) : null}
      {selectable && selectedCount > 0 ? (
        <BulkActionsBar
          selectedCount={selectedCount}
          bulkActions={bulkActions}
          bulkLoading={bulkLoading}
          handleBulkAction={handleBulkAction}
        />
      ) : null}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-auto"
        onScroll={(e) => setIsPinnedScrolled(e.currentTarget.scrollLeft > 0)}
      >
        {showRefreshOverlay ? (
          <div
            data-testid={id ? `table-refreshing-${id}` : "table-refreshing"}
            // `role="status"` so the visible "Refreshing…" is announced: the
            // overlay changes the rows under a screen-reader user with no
            // other signal (the table's own `aria-busy` below marks the state
            // but does not speak it) (ROADMAP R2.7).
            role="status"
            className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center"
          >
            <div className="bg-background flex flex-col items-center gap-2 rounded-lg border px-4 py-3 shadow-sm">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
              <span className="text-muted-foreground text-xs font-medium">
                Refreshing…
              </span>
            </div>
          </div>
        ) : null}
        <Table
          data-testid={id ? `table-${id}` : undefined}
          aria-busy={showRefreshOverlay || undefined}
        >
          <TableHeader>
            <TableRow>
              {selectable ? (
                <SelectAllHeadCell
                  isPinnedScrolled={isPinnedScrolled}
                  lastStickyColumnId={lastStickyColumnId}
                  selectAllRef={selectAllRef}
                  allVisibleSelected={allVisibleSelected}
                  visibleLength={visible.length}
                  handleSelectAll={handleSelectAll}
                />
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
            {showSkeletonRows ? (
              <TableSkeletonRows
                size={size}
                selectable={selectable}
                columns={filteredColumns}
                pinnedColumnSet={pinnedColumnSet}
              />
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
                    // A `cursor-pointer` row driven only by onClick is
                    // mouse-only (WCAG 2.1.1) — it looks interactive and does
                    // nothing for a keyboard user. Give it a focus stop and the
                    // two standard activation keys, centrally, so no page has
                    // to remember (ROADMAP R2.3).
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return
                            }
                            // Space scrolls the page otherwise.
                            event.preventDefault()
                            onRowClick(row)
                          }
                        : undefined
                    }
                    className={cn(
                      "group/row",
                      onRowClick ? "cursor-pointer" : undefined,
                      selectable && isSelected ? "bg-muted/50" : undefined,
                    )}
                    aria-selected={selectable ? isSelected : undefined}
                  >
                    {selectable ? (
                      <SelectRowCell
                        isSelected={isSelected}
                        isPinnedScrolled={isPinnedScrolled}
                        lastStickyColumnId={lastStickyColumnId}
                        onToggle={() => handleSelectOne(key)}
                      />
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
        <TableFooter
          paginated={paginated}
          from={from}
          to={to}
          serverPaginated={serverPaginated}
          serverTotal={serverTotal}
          sortedLength={sorted.length}
          displayTotal={displayTotal}
          pageSizeOptions={pageSizeOptions}
          size={size}
          page={currentPage}
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          userChangedSize={userChangedSize}
          setSize={setSize}
          setPage={setPage}
          refreshing={refreshing}
          setRefreshing={setRefreshing}
          onRefresh={onRefresh}
          id={id}
          setSettingsOpen={setSettingsOpen}
          csv={effectiveCsv}
          handleDownloadCsv={handleDownloadCsv}
        />
      ) : null}

      {id ? (
        <ColumnSettingsDialog
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          columns={columns}
          pinnedColumnIds={pinnedColumnIds}
          visibleColumnIds={visibleColumnIds}
          stickyColumnIds={stickyColumnIds}
          toggleColumn={toggleColumn}
        />
      ) : null}

      {searchable && id ? (
        <SearchColumnsDialog
          filterOpen={filterOpen}
          setFilterOpen={setFilterOpen}
          allSearchableIds={allSearchableIds}
          columns={columns}
          searchColumnIds={searchColumnIds}
          toggleSearchColumn={toggleSearchColumn}
        />
      ) : null}

      <BulkActionConfirmDialog
        pendingBulkAction={pendingBulkAction}
        setPendingBulkAction={setPendingBulkAction}
        executePendingBulkAction={executePendingBulkAction}
      />
    </div>
  )
}
