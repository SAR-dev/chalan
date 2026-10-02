"use client"

import { CalendarDays, X } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addBusinessDays,
  businessMonthStart,
  businessPrevMonthRange,
  businessToday,
} from "@/lib/timezone"
import { cn } from "@/lib/utils"

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "This month", days: undefined, isMonth: true },
  { label: "Last month", days: undefined, isLastMonth: true },
] as const

interface DateRangePickerProps {
  from: string | undefined
  to: string | undefined
  onFromChange: (val: string | undefined) => void
  onToChange: (val: string | undefined) => void
  className?: string
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: DateRangePickerProps) {
  const [preset, setPreset] = useState<string>("")

  const applyPreset = useCallback(
    (value: string) => {
      setPreset(value)
      // Business-local calendar days, so "Today" is the Dhaka day even when
      // The browser is not in that zone.
      const today = businessToday()

      if (value === "Today") {
        onFromChange(today)
        onToChange(today)
      } else if (value === "Last 7 days") {
        onFromChange(addBusinessDays(today, -6))
        onToChange(today)
      } else if (value === "Last 30 days") {
        onFromChange(addBusinessDays(today, -29))
        onToChange(today)
      } else if (value === "This month") {
        onFromChange(businessMonthStart(today))
        onToChange(today)
      } else if (value === "Last month") {
        const range = businessPrevMonthRange(today)
        onFromChange(range.from)
        onToChange(range.to)
      }
    },
    [onFromChange, onToChange],
  )

  const hasActiveFilter = useMemo(
    () => from !== undefined || to !== undefined,
    [from, to],
  )

  function handleClear() {
    setPreset("")
    onFromChange(undefined)
    onToChange(undefined)
  }

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <CalendarDays className="text-muted-foreground size-4" />
        <Input
          type="date"
          value={from ?? ""}
          onChange={(e) => {
            setPreset("")
            onFromChange(e.target.value || undefined)
          }}
          className="h-8 w-36 text-xs"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-xs">—</span>
        <Input
          type="date"
          value={to ?? ""}
          onChange={(e) => {
            setPreset("")
            onToChange(e.target.value || undefined)
          }}
          className="h-8 w-36 text-xs"
          aria-label="To date"
        />
      </div>

      <Select
        value={preset}
        onValueChange={(v) => {
          if (v) applyPreset(v)
        }}
      >
        <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
          <SelectValue placeholder="Quick range" />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.label} value={p.label} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilter ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-muted-foreground h-8 px-2 text-xs"
        >
          <X className="size-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
