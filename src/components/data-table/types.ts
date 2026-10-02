import type * as React from "react"

export type Align = "left" | "right" | "center"

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

export interface DataTableProps<T> {
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
  /** Column id to sort by initially. */
  initialSortId?: string
  initialSortDir?: SortDir
  emptyMessage?: React.ReactNode
  onRowClick?: (row: T) => void
  className?: string
  /** Enables a "Download CSV" button in the footer. When omitted, a CSV
   * export is derived automatically from the rendered columns that have a
   * string header and a `sortValue` extractor, covering every row matching
   * the current search/filter. The button is hidden when nothing is
   * exportable — no such columns, or no rows. */
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

export type SortDir = "asc" | "desc"
