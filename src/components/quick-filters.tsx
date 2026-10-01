"use client"

import { SlidersHorizontal, XIcon } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface QuickFilterItem {
  label: string
  value: string
  active: boolean
  onToggle: () => void
}

export interface QuickFilterSection {
  label: string
  filters: QuickFilterItem[]
}

interface QuickFiltersProps {
  sections: QuickFilterSection[]
  onClearAll: () => void
  activeCount: number
  /** Total items across all sections. If > threshold, render as modal. */
  modalThreshold?: number
}

function FilterContent({
  sections,
  onClearAll,
  activeCount,
}: Omit<QuickFiltersProps, "modalThreshold">) {
  const totalFilters = sections.reduce((s, sec) => s + sec.filters.length, 0)

  return (
    <div className="flex flex-col gap-1">
      {sections.map((section, i) => (
        <React.Fragment key={section.label}>
          {i > 0 && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
            {section.filters.map((filter) => (
              <DropdownMenuItem
                key={filter.value}
                onClick={filter.onToggle}
                className={cn(
                  "gap-2",
                  filter.active && "bg-accent text-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-sm border border-primary",
                    filter.active
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50",
                  )}
                >
                  {filter.active && (
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
                {filter.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </React.Fragment>
      ))}
      {activeCount > 0 && (
        <>
          <DropdownMenuSeparator />
          <button
            type="button"
            onClick={onClearAll}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
            Clear all
          </button>
        </>
      )}
      {totalFilters === 0 && (
        <div className="px-1.5 py-2 text-sm text-muted-foreground">
          No filters available
        </div>
      )}
    </div>
  )
}

function QuickFiltersDropdown({
  sections,
  onClearAll,
  activeCount,
}: Omit<QuickFiltersProps, "modalThreshold">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal className="size-3.5" />
        Quick Filters
        {activeCount > 0 && (
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
            {activeCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <FilterContent
          sections={sections}
          onClearAll={onClearAll}
          activeCount={activeCount}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function QuickFiltersModal({
  sections,
  onClearAll,
  activeCount,
}: Omit<QuickFiltersProps, "modalThreshold">) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal className="size-3.5" />
        Quick Filters
        {activeCount > 0 && (
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
            {activeCount}
          </Badge>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Filters</DialogTitle>
          <DialogDescription>
            Narrow the list by date or category. Filters combine with the
            table&apos;s search rather than replacing it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {section.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {section.filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={filter.onToggle}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                      filter.active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {activeCount > 0 && (
          <div className="flex justify-end border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              <XIcon className="size-3.5" />
              Clear all
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function QuickFilters({
  sections,
  onClearAll,
  activeCount,
  modalThreshold = 15,
}: QuickFiltersProps) {
  const totalItems = sections.reduce((s, sec) => s + sec.filters.length, 0)
  const useModal = totalItems > modalThreshold

  if (useModal) {
    return (
      <QuickFiltersModal
        sections={sections}
        onClearAll={onClearAll}
        activeCount={activeCount}
      />
    )
  }

  return (
    <QuickFiltersDropdown
      sections={sections}
      onClearAll={onClearAll}
      activeCount={activeCount}
    />
  )
}
