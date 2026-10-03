"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { SidebarConfig, SidebarNavItem } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

/**
 * Menu search: a command palette over the current role's nav items.
 *
 * Deliberately built on the existing Dialog + Input primitives rather than
 * pulling in cmdk — the item set is small (one role's sidebar), the only
 * actions are filter and navigate, and the project's dependency gate
 * (pnpm audit, every entry in auditConfig.ignoreGhsas needing a reason) makes
 * a new runtime dependency a real cost for a real but simple feature.
 *
 * Keyboard model:
 *   ↑ / ↓        move the active row (wraps)
 *   Enter        navigate to the active row and close
 *   Esc          close (also handled by Dialog itself)
 * Typing filters immediately against label, group, and href.
 */
export function CommandPalette({
  open,
  onOpenChange,
  config,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: SidebarConfig
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on every open: a stale query from last time would land the user on
  // a filtered list they didn't ask for.
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
    }
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = config.items
    if (!q) return items
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.group ?? "").toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q),
    )
  }, [config.items, query])

  // Clamp when the filter shrinks below the active row — otherwise Enter
  // would navigate to an index that no longer exists.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(matches.length - 1, 0)))
  }, [matches.length])

  function navigate(item: SidebarNavItem) {
    onOpenChange(false)
    router.push(item.href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % Math.max(matches.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex(
        (i) =>
          (i - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1),
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = matches[activeIndex]
      if (item) navigate(item)
    }
  }

  // Keep the active row in view while arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        // The palette is a combobox, not a form — the default dialog
        // description would be announced as an extra label with no control
        // attached to it.
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search menu</DialogTitle>
        <div className="border-border flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            data-testid="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages…"
            autoFocus
            className="border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-label="Search menu"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={
              matches[activeIndex]
                ? `palette-item-${matches[activeIndex].href}`
                : undefined
            }
          />
        </div>

        <div
          id="palette-list"
          role="listbox"
          aria-label="Menu results"
          ref={listRef}
          className="max-h-[min(60vh,20rem)] overflow-y-auto p-1"
        >
          {matches.length === 0 ? (
            <p
              data-testid="palette-empty"
              className="text-muted-foreground px-3 py-6 text-center text-sm"
            >
              No pages match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            matches.map((item, index) => {
              const Icon = item.icon
              const active = index === activeIndex
              return (
                <div
                  key={item.href}
                  id={`palette-item-${item.href}`}
                  role="option"
                  aria-selected={active}
                  data-index={index}
                  data-testid={`palette-item-${item.href}`}
                  // Focus stays in the input (combobox model), so rows are
                  // programmatically focusable only — tabIndex -1 keeps them
                  // out of the tab order while satisfying the reachability
                  // rule for the click target.
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigate(item)}
                  // Rows are activated from the input (↑/↓/Enter) or by
                  // pointer; Enter here covers a row that received focus by
                  // other means (screen-reader virtual cursor).
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      navigate(item)
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/80",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.group && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {item.group}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
