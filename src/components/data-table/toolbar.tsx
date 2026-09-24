import { Filter, Search } from "lucide-react"
import type * as React from "react"
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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { MIN_VISIBLE_COLUMNS } from "./column-visibility"
import type { DataTableColumn } from "./types"

interface DataTableToolbarProps {
  toolbarLeft?: React.ReactNode
  id?: string
  serverPaginated: boolean
  controlledQuery?: string
  searchQuery: string
  onQueryChange?: (query: string) => void
  setSearchQuery: (query: string) => void
  setPage: (page: number) => void
  searchColumnIds: string[]
  allSearchableIds: string[]
  setFilterOpen: (open: boolean) => void
}

export function DataTableToolbar({
  toolbarLeft,
  id,
  serverPaginated,
  controlledQuery,
  searchQuery,
  onQueryChange,
  setSearchQuery,
  setPage,
  searchColumnIds,
  allSearchableIds,
  setFilterOpen,
}: DataTableToolbarProps) {
  return (
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
  )
}

interface ColumnSettingsDialogProps<T> {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  columns: DataTableColumn<T>[]
  pinnedColumnIds: string[]
  visibleColumnIds: string[]
  stickyColumnIds: string[]
  toggleColumn: (columnId: string) => void
}

export function ColumnSettingsDialog<T>({
  settingsOpen,
  setSettingsOpen,
  columns,
  pinnedColumnIds,
  visibleColumnIds,
  stickyColumnIds,
  toggleColumn,
}: ColumnSettingsDialogProps<T>) {
  return (
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
  )
}

interface SearchColumnsDialogProps<T> {
  filterOpen: boolean
  setFilterOpen: (open: boolean) => void
  allSearchableIds: string[]
  columns: DataTableColumn<T>[]
  searchColumnIds: string[]
  toggleSearchColumn: (columnId: string) => void
}

export function SearchColumnsDialog<T>({
  filterOpen,
  setFilterOpen,
  allSearchableIds,
  columns,
  searchColumnIds,
  toggleSearchColumn,
}: SearchColumnsDialogProps<T>) {
  return (
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
  )
}
