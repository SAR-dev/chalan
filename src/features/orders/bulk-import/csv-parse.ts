/**
 * CSV/TSV parsing for bulk order import (§3.4). Pure module: decoding takes
 * bytes or text, so file handling stays in the dialog. Papa runs with
 * `delimiter: ""` (auto-detect) and `header: true`; physical line numbers
 * (`__line`, header = line 1) are attributed from Papa's row cursors so error
 * messages match the merchant's spreadsheet.
 */

import Papa from "papaparse"
import { MAX_BULK_ORDERS } from "@/lib/constants"
import {
  type OrderImportHeader,
  orderImportHeaders,
  requiredImportHeaders,
  resolveImportHeader,
} from "./template"

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export const UTF8_ERROR =
  "This file doesn't look like valid UTF-8. Re-save it as 'CSV UTF-8' in Excel/Sheets."

export interface RawOrderRow {
  /** Physical source line of the row (header = 1). */
  __line: number
  values: Record<OrderImportHeader, string>
}

export type ImportParseResult =
  | { ok: true; rows: RawOrderRow[] }
  | { ok: false; error: string }

export interface ImportFileInput {
  name: string
  size: number
  buffer: ArrayBuffer | Uint8Array
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}

/** Strict UTF-8 decode with BOM stripping; rejects invalid bytes and U+FFFD. */
export function decodeUtf8(
  buffer: ArrayBuffer | Uint8Array,
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    if (text.includes("\uFFFD")) return { ok: false, error: UTF8_ERROR }
    return { ok: true, text: text.replace(/^\uFEFF/, "") }
  } catch {
    return { ok: false, error: UTF8_ERROR }
  }
}

/** File-level guards (`.csv`, ≤ 2 MB) then decode + parse. */
export function parseImportFile(input: ImportFileInput): ImportParseResult {
  if (!input.name.toLowerCase().endsWith(".csv")) {
    return {
      ok: false,
      error: `"${input.name}" is not a .csv file. Export your sheet as "CSV UTF-8" and try again.`,
    }
  }
  if (input.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `This file is ${formatMb(input.size)}. The import limit is ${formatMb(MAX_IMPORT_BYTES)} (up to ${MAX_BULK_ORDERS} rows).`,
    }
  }
  const decoded = decodeUtf8(input.buffer)
  if (!decoded.ok) return decoded
  return parseImportText(decoded.text)
}

/** Number of physical lines consumed by `prefix` (1-based position). */
function lineAt(prefix: string): number {
  return prefix.split(/\r\n|\n|\r/).length
}

/** Cursor after the header row (and the raw header cells), via Papa step. */
function headerInfo(text: string): { end: number; cells: string[] } {
  let end = 0
  let cells: string[] = []
  Papa.parse<string[]>(text, {
    header: false,
    delimiter: "",
    step: (results, parser) => {
      end = results.meta.cursor
      cells = results.data
      parser.abort()
    },
  })
  return { end, cells }
}

function emptyValues(): Record<OrderImportHeader, string> {
  const values = {} as Record<OrderImportHeader, string>
  for (const header of orderImportHeaders) values[header] = ""
  return values
}

/** Parses CSV or pasted TSV text into rows with physical line numbers. */
export function parseImportText(input: string): ImportParseResult {
  const text = input.replace(/^\uFEFF/, "")
  if (!text.trim()) {
    return {
      ok: false,
      error:
        "Nothing to import. Add rows below the header row, or choose a CSV file.",
    }
  }

  const { end, cells } = headerInfo(text)
  const resolved = cells.map((cell) => resolveImportHeader(cell))
  const missing = requiredImportHeaders.filter(
    (header) => !resolved.includes(header),
  )
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${missing.join(", ")}. Download the template to see the expected format.`,
    }
  }

  const rows: RawOrderRow[] = []
  let previousEnd = end
  Papa.parse<Record<string, unknown>>(text, {
    header: true,
    delimiter: "",
    step: (results) => {
      const line = lineAt(text.slice(0, previousEnd))
      previousEnd = results.meta.cursor
      const data = results.data
      const fullyEmpty = Object.values(data).every(
        (value) => value == null || String(value).trim() === "",
      )
      if (fullyEmpty) return
      const values = emptyValues()
      for (const [rawHeader, cell] of Object.entries(data)) {
        const header = resolveImportHeader(rawHeader)
        if (header) values[header] = cell == null ? "" : String(cell)
      }
      rows.push({ __line: line, values })
    },
  })

  if (rows.length === 0) {
    return {
      ok: false,
      error: "No data rows found. Add at least one row below the header row.",
    }
  }
  if (rows.length > MAX_BULK_ORDERS) {
    return {
      ok: false,
      error: `This file has ${rows.length} rows. You can import up to ${MAX_BULK_ORDERS} rows at a time.`,
    }
  }
  return { ok: true, rows }
}
