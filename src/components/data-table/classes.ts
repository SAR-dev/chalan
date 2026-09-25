import type { Align } from "./types"

export const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

export const justifyClass: Record<Align, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
}

// Sticky cells need an opaque background to hide content scrolling behind
// them. Header cells stay flat; body cells also pick up the row's
// hover/selected shading via `group-hover/row` since `group/row` is applied
// on TableRow (an inline background here would win over those classes
// instead, which is what broke this before).
export const stickyHeadClass = "bg-background"
export const stickyCellClass = "bg-background group-hover/row:bg-muted/50"
// Divider marking the edge of the pinned column area, shown once the table
// has been scrolled horizontally.
export const pinnedEdgeClass =
  "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:shadow-[2px_0_6px_-2px_rgb(0_0_0_/_0.15)] after:content-['']"
// Left-edge divider for the first pinned column, shown when the table has
// been scrolled horizontally (so content is visible to its left).
export const pinnedLeftEdgeClass =
  "after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-border after:shadow-[-2px_0_6px_-2px_rgb(0_0_0_/_0.15)] after:content-['']"
