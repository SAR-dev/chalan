import type * as React from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { TableCell, TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { pinnedEdgeClass, stickyCellClass, stickyHeadClass } from "./classes"
import type { DataTableBulkAction } from "./types"

interface SelectAllHeadCellProps {
  isPinnedScrolled: boolean
  lastStickyColumnId: string | null
  selectAllRef: React.RefObject<HTMLInputElement | null>
  allVisibleSelected: boolean
  visibleLength: number
  handleSelectAll: () => void
}

export function SelectAllHeadCell({
  isPinnedScrolled,
  lastStickyColumnId,
  selectAllRef,
  allVisibleSelected,
  visibleLength,
  handleSelectAll,
}: SelectAllHeadCellProps) {
  return (
    <TableHead
      className={cn(
        "relative w-10",
        stickyHeadClass,
        isPinnedScrolled &&
          lastStickyColumnId === "__select__" &&
          pinnedEdgeClass,
      )}
      data-sticky-col="__select__"
      // NOT aria-hidden: this cell wraps the focusable select-all checkbox, so
      // hiding the subtree left a tab-stop that announced as nothing and made
      // bulk select unreachable to a screen reader (ROADMAP R2.2).
    >
      <input
        ref={selectAllRef}
        type="checkbox"
        checked={allVisibleSelected && visibleLength > 0}
        onChange={handleSelectAll}
        className="size-4 cursor-pointer"
        aria-label={
          allVisibleSelected ? "Deselect all rows" : "Select all rows"
        }
      />
    </TableHead>
  )
}

interface SelectRowCellProps {
  isSelected: boolean
  isPinnedScrolled: boolean
  lastStickyColumnId: string | null
  onToggle: () => void
}

export function SelectRowCell({
  isSelected,
  isPinnedScrolled,
  lastStickyColumnId,
  onToggle,
}: SelectRowCellProps) {
  return (
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
        onChange={onToggle}
        className="size-4 cursor-pointer"
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    </TableCell>
  )
}

interface BulkActionsBarProps<T> {
  selectedCount: number
  bulkActions?: DataTableBulkAction<T>[]
  bulkLoading: boolean
  handleBulkAction: (action: DataTableBulkAction<T>) => void
}

export function BulkActionsBar<T>({
  selectedCount,
  bulkActions,
  bulkLoading,
  handleBulkAction,
}: BulkActionsBarProps<T>) {
  return (
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
  )
}

type PendingBulkAction<T> = {
  action: DataTableBulkAction<T>
  rows: T[]
}

interface BulkActionConfirmDialogProps<T> {
  pendingBulkAction: PendingBulkAction<T> | null
  setPendingBulkAction: React.Dispatch<
    React.SetStateAction<PendingBulkAction<T> | null>
  >
  executePendingBulkAction: () => void
}

export function BulkActionConfirmDialog<T>({
  pendingBulkAction,
  setPendingBulkAction,
  executePendingBulkAction,
}: BulkActionConfirmDialogProps<T>) {
  return (
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
  )
}
