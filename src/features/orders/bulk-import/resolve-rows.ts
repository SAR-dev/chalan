/**
 * Row resolution and validation for bulk order import. Pure module: the
 * import page injects the lookup maps (pickup locations, active cities). Each
 * row is normalized, mapped to IDs, auto-tagged with the import marker, then
 * validated with `orderCreateSchema`; errors come back as `Row N: ...`
 * instructions via the `formatError` pattern.
 *
 * Note what is NOT here: any weight limit. The limit belongs to the lane
 * (`zone_pricing.maxWeightKg`) and depends on both endpoints of the row, so it
 * is resolved by `quoteParcel` and reported from the preview.
 */

import { businessToday } from "@/lib/timezone"
import type { CreateOrderInput, DeliveryType } from "@/lib/types"
import { formatError, orderCreateSchema } from "@/lib/validation"
import type { RawOrderRow } from "./csv-parse"
import type { OrderImportHeader } from "./template"

export interface ResolveLookup {
  id: string
  name: string
}

export interface ResolveLookups {
  pickupLocations: ResolveLookup[]
  deliveryCities: ResolveLookup[]
}

export interface ResolvedRow {
  /** Physical CSV line, used for `Row N:` messages and preview keys. */
  line: number
  /** Original cells (canonical headers) — the error CSV source. */
  raw: Record<OrderImportHeader, string>
  input: CreateOrderInput
  errors: string[]
  /**
   * Same messages attributed to the offending column, so the preview can show
   * them under the cell instead of a separate errors column. Row-level messages
   * stay in `errors` for filtering and the "jump to first error" action.
   */
  fieldErrors: Partial<Record<OrderImportHeader, string>>
}

/** Zod issue path → the CSV column that produced it. */
const INPUT_HEADERS: Record<string, OrderImportHeader> = {
  pickupLocationId: "pickup_location",
  recipientName: "recipient_name",
  recipientPhone: "recipient_phone",
  deliveryCityId: "delivery_city",
  deliveryAddress: "delivery_address",
  deliveryMapLink: "delivery_map_link",
  parcelWeightKg: "parcel_weight_kg",
  itemType: "item_type",
  deliveryType: "delivery_type",
  productCost: "product_cost",
  merchantNote: "merchant_note",
}

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯"

function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) =>
    String(BANGLA_DIGITS.indexOf(digit)),
  )
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

/** `+880…`, `+88…`, spaces, dashes and Bangla digits → `01XXXXXXXXX`. */
export function normalizePhone(value: string): string {
  let phone = toAsciiDigits(value).replace(/[\s-]/g, "")
  if (phone === "") return ""
  phone = phone.replace(/^\+/, "")
  if (phone.startsWith("880")) phone = phone.slice(3)
  else if (phone.startsWith("88")) phone = phone.slice(2)
  if (!phone.startsWith("0")) phone = `0${phone}`
  return phone
}

/** `1,5`/`1.5` → 1.5, thousands commas stripped, `৳`/`TK` removed. */
export function normalizeNumber(value: string): number {
  let normalized = toAsciiDigits(value)
    .replace(/৳/g, "")
    .replace(/TK/gi, "")
    .replace(/\s+/g, "")
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "")
  } else {
    normalized = normalized.replace(/,/g, ".")
  }
  if (normalized === "") return Number.NaN
  return Number(normalized)
}

function findLookup(lookups: ResolveLookup[], name: string): string | null {
  const needle = collapseWhitespace(name).toLowerCase()
  if (!needle) return null
  return (
    lookups.find(
      (lookup) => collapseWhitespace(lookup.name).toLowerCase() === needle,
    )?.id ?? null
  )
}

function csvImportTag(): string {
  // Business-local date, so a batch imported just before Dhaka
  // midnight is tagged with Dhaka's date rather than the browser's.
  return `[CSV import ${businessToday()}]`
}

/**
 * Normalizes, resolves and validates one row. The editable preview calls this
 * for the single row a cell edit changed, so fixing a cell re-validates that
 * row (and only that row) without disturbing line numbers or row order.
 */
export function resolveRow(
  row: RawOrderRow,
  lookups: ResolveLookups,
): ResolvedRow {
  const { values } = row
  const line = row.__line
  const errors: string[] = []
  const fieldErrors: Partial<Record<OrderImportHeader, string>> = {}
  const covered = new Set<string>()
  const push = (message: string) => errors.push(`Row ${line}: ${message}`)
  const pushField = (header: OrderImportHeader, message: string) => {
    fieldErrors[header] = fieldErrors[header]
      ? `${fieldErrors[header]} ${message}`
      : message
  }
  /** Row-level message (jump/filter) plus the column it belongs to (inline). */
  const pushBoth = (header: OrderImportHeader, message: string) => {
    push(message)
    pushField(header, message)
  }

  let pickupLocationId = ""
  const pickupName = collapseWhitespace(values.pickup_location)
  if (pickupName) {
    const found = findLookup(lookups.pickupLocations, pickupName)
    if (found) pickupLocationId = found
    else {
      pushBoth("pickup_location", `Unknown pickup location "${pickupName}".`)
      covered.add("pickupLocationId")
    }
  }

  let deliveryCityId = ""
  const cityName = collapseWhitespace(values.delivery_city)
  if (cityName) {
    const found = findLookup(lookups.deliveryCities, cityName)
    if (found) deliveryCityId = found
    else {
      pushBoth("delivery_city", `Unknown delivery city "${cityName}".`)
      covered.add("deliveryCityId")
    }
  }

  let parcelWeightKg = Number.NaN
  const weightRaw = values.parcel_weight_kg.trim()
  if (!weightRaw) {
    pushBoth("parcel_weight_kg", "Parcel weight is required.")
    covered.add("parcelWeightKg")
  } else {
    parcelWeightKg = normalizeNumber(weightRaw)
    if (Number.isNaN(parcelWeightKg)) {
      pushBoth("parcel_weight_kg", "Parcel weight must be a number like 1.5.")
      covered.add("parcelWeightKg")
    }
    // No weight-limit check here. The limit belongs to the lane
    // (`zone_pricing.maxWeightKg`), which depends on the pickup city AND the
    // destination city — neither known while parsing a CSV cell — so it is
    // resolved by `quoteParcel` and reported from the preview instead.
  }

  let productCost = Number.NaN
  const costRaw = values.product_cost.trim()
  if (!costRaw) {
    pushBoth("product_cost", "Product cost is required.")
    covered.add("productCost")
  } else {
    productCost = normalizeNumber(costRaw)
    if (Number.isNaN(productCost)) {
      pushBoth("product_cost", "Product cost must be a number like 1200.")
      covered.add("productCost")
    }
  }

  const deliveryType = (values.delivery_type.trim().toUpperCase() ||
    "STANDARD") as DeliveryType
  if (deliveryType !== "STANDARD" && deliveryType !== "FRAGILE") {
    pushBoth("delivery_type", "Delivery type must be STANDARD or FRAGILE.")
    covered.add("deliveryType")
  }

  const deliveryMapLink = values.delivery_map_link.trim()

  const input: CreateOrderInput = {
    pickupLocationId,
    recipientName: values.recipient_name.trim(),
    recipientPhone: normalizePhone(values.recipient_phone),
    deliveryCityId,
    deliveryAddress: values.delivery_address.trim(),
    deliveryMapLink: deliveryMapLink || null,
    parcelWeightKg,
    // Optional and never coerced: an empty cell means the merchant did not say,
    // which is stored as NULL. Not defaulted to something like "Parcel" — a
    // placeholder written once would be read back later as if the merchant had
    // actually stated it.
    itemType: collapseWhitespace(values.item_type) || null,
    deliveryType,
    productCost,
    merchantNote: values.merchant_note.trim() || csvImportTag(),
  }

  const parsed = orderCreateSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .filter((issue) => !covered.has(String(issue.path[0])))
      .map((issue) => ({
        path: issue.path.filter(
          (part): part is string | number =>
            typeof part === "string" || typeof part === "number",
        ),
        message: issue.message,
        header: INPUT_HEADERS[String(issue.path[0])],
      }))
    if (issues.length > 0) push(formatError({ issues }))
    for (const issue of issues) {
      if (issue.header) pushField(issue.header, issue.message)
    }
  }

  return { line, raw: values, input, errors, fieldErrors }
}

/** Normalizes, resolves and validates every parsed row in one pass. */
export function resolveRows(
  rows: RawOrderRow[],
  lookups: ResolveLookups,
): ResolvedRow[] {
  return rows.map((row) => resolveRow(row, lookups))
}
