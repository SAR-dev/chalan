/**
 * Generic CSV helpers. Cross-cutting concern, so it lives in `lib/` rather
 * than under a feature — mirrors how `lib/storage` centralizes uploads.
 */

type CsvCell = string | number | null | undefined

function escapeCell(cell: CsvCell): string {
  const value = cell == null ? "" : String(cell)
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Builds RFC 4180 CSV text from rows of cells, with an optional header row. */
export function toCsv(rows: CsvCell[][], headers?: string[]): string {
  const lines = headers ? [headers, ...rows] : rows
  return lines.map((line) => line.map(escapeCell).join(",")).join("\r\n")
}

function timestampPrefix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const h = String(now.getHours()).padStart(2, "0")
  const min = String(now.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}_${h}-${min}`
}

/** Triggers a browser download of `content` as a file named `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\ufeff", content], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const ts = timestampPrefix()
  const base = filename.endsWith(".csv") ? filename.slice(0, -4) : filename
  link.href = url
  link.download = `${ts}_${base}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
