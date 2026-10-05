"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /**
   * Test hook. Optional so existing call sites are untouched; set it wherever
   * the box is the only way to reach a view (a board or a filter bar rather
   * than a table), so a spec never has to match on the placeholder text.
   */
  testId?: string
  /**
   * Associates the box with a visible `<Label htmlFor>`. When set, the implicit
   * `aria-label` is dropped so the label element is the single accessible name —
   * two competing names would have a screen reader announcing the wrong one.
   */
  id?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  testId,
  id,
}: SearchInputProps) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        id={id}
        placeholder={placeholder}
        aria-label={id ? undefined : placeholder}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  )
}
