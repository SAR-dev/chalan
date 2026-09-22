"use client"

import { DateRangePicker } from "@/components/date-range-picker"
import { type StatusTab, StatusTabs } from "@/components/filters/status-tabs"
import { SearchInput } from "@/components/search-input"

interface FilterBarProps {
  query: string
  onQueryChange: (value: string) => void
  searchPlaceholder?: string
  statuses?: StatusTab[]
  status?: string | undefined
  onStatusChange?: (value: string | undefined) => void
  dateFrom?: string
  dateTo?: string
  onDateFromChange?: (value: string | undefined) => void
  onDateToChange?: (value: string | undefined) => void
  showDateRange?: boolean
  className?: string
}

export function FilterBar({
  query,
  onQueryChange,
  searchPlaceholder = "Search...",
  statuses,
  status,
  onStatusChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  showDateRange = false,
  className,
}: FilterBarProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder={searchPlaceholder}
        />

        {statuses && onStatusChange && (
          <StatusTabs
            tabs={statuses}
            value={status}
            onChange={onStatusChange}
          />
        )}

        {showDateRange && onDateFromChange && onDateToChange && (
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFromChange={onDateFromChange}
            onToChange={onDateToChange}
          />
        )}
      </div>
    </div>
  )
}
