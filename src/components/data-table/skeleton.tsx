import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { stickyCellClass } from "./classes"
import type { DataTableColumn } from "./types"

interface TableSkeletonRowsProps<T> {
  size: number
  selectable: boolean
  columns: DataTableColumn<T>[]
  pinnedColumnSet: Set<string>
}

export function TableSkeletonRows<T>({
  size,
  selectable,
  columns,
  pinnedColumnSet,
}: TableSkeletonRowsProps<T>) {
  return (
    <>
      {Array.from({ length: size || 5 }).map((_, rowIndex) => (
        <TableRow key={`skeleton-${rowIndex}`}>
          {selectable ? (
            <TableCell
              className={cn("w-10", stickyCellClass)}
              data-sticky-cell="__select__"
            >
              <div className="size-4" />
            </TableCell>
          ) : null}
          {columns.map((col, colIndex) => (
            <TableCell
              key={col.id}
              className={cn(
                (col.sticky || pinnedColumnSet.has(col.id)) && stickyCellClass,
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
                    : colIndex === columns.length - 1
                      ? "w-1/2"
                      : "w-full",
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
