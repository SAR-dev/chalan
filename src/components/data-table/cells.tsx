import * as React from "react"
import { cn } from "@/lib/utils"

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
