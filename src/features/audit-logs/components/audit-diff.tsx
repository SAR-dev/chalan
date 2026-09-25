import type { AuditLog } from "@/lib/types"

export type AuditDiff = Record<string, { from: unknown; to: unknown }>

export function readAuditDiff(metadata: unknown): AuditDiff | null {
  if (!metadata || typeof metadata !== "object") return null
  const diff = (metadata as Record<string, unknown>).diff
  if (!diff || typeof diff !== "object") return null
  return Object.keys(diff as Record<string, unknown>).length > 0
    ? (diff as AuditDiff)
    : null
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (Array.isArray(value)) return value.map(formatValue).join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

export function AuditDiffCell({
  metadata,
}: {
  metadata: AuditLog["metadata"]
}) {
  const diff = readAuditDiff(metadata)
  if (!diff) {
    return <span className="text-muted-foreground text-sm">—</span>
  }
  return (
    <div
      data-testid="audit-diff"
      className="flex flex-col gap-0.5 text-xs whitespace-nowrap"
    >
      {Object.entries(diff).map(([field, change]) => (
        <div key={field} className="flex items-baseline gap-1.5">
          <span className="font-medium">{field}</span>
          <span className="text-muted-foreground">
            {formatValue(change.from)} → {formatValue(change.to)}
          </span>
        </div>
      ))}
    </div>
  )
}
