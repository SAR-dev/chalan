import type { LucideIcon } from "lucide-react"
import { Package } from "lucide-react"

interface DataTableEmptyProps {
  icon?: LucideIcon
  title: string
  description?: string
}

export function DataTableEmpty({
  icon: Icon = Package,
  title,
  description,
}: DataTableEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
