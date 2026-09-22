import { Badge } from "@/components/ui/badge"
import { BADGE_TONES, type BadgeTone } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function StatusBadge({
  label,
  tone,
  size = "sm",
}: {
  label: string
  tone: BadgeTone
  size?: "sm" | "md"
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        size === "md" && "px-2.5 py-0.5 text-sm",
        BADGE_TONES[tone],
      )}
    >
      {label}
    </Badge>
  )
}
