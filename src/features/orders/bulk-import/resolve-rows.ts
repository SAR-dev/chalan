/**
 * Row resolution and validation for bulk order import (§6). Pure module: the
 * dialog injects the lookup maps (pickup locations, active cities) and the
 * merchant's `maxWeightKg`. Each row is normalized per §3.2, mapped to IDs,
 * auto-tagged per §7, then validated with `orderCreateSchema`; errors come
 * back as `Row N: ...` instructions via the `formatError` pattern.
 */

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
  maxWeightKg: number
}

export interface ResolvedRow {
  /** Physical CSV line, used for `Row N:` messages and preview keys. */
  line: number
  /** Original cells (canonical headers) — the error CSV source. */
  raw: Record<OrderImportHeader, string>
  input: CreateOrderInput
  errors: string[]
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
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `[CSV import ${year}-${month}-${day}]`
}

function resolveRow(row: RawOrderRow, lookups: ResolveLookups): ResolvedRow {
  const { values } = row
  const line = row.__line
  const errors: string[] = []
  const covered = new Set<string>()
  const push = (message: string) => errors.push(`Row ${line}: ${message}`)

  let pickupLocationId = ""
  const pickupName = collapseWhitespace(values.pickup_location)
  if (pickupName) {
    const found = findLookup(lookups.pickupLocations, pickupName)
    if (found) pickupLocationId = found
    else {
      push(`Unknown pickup location "${pickupName}".`)
      covered.add("pickupLocationId")
    }
  }

  let deliveryCityId = ""
  const cityName = collapseWhitespace(values.delivery_city)
  if (cityName) {
    const found = findLookup(lookups.deliveryCities, cityName)
    if (found) deliveryCityId = found
    else {
      push(`Unknown delivery city "${cityName}".`)
      covered.add("deliveryCityId")
    }
  }

  let parcelWeightKg = Number.NaN
  const weightRaw = values.parcel_weight_kg.trim()
  if (!weightRaw) {
    push("Parcel weight is required.")
    covered.add("parcelWeightKg")
  } else {
    parcelWeightKg = normalizeNumber(weightRaw)
    if (Number.isNaN(parcelWeightKg)) {
      push("Parcel weight must be a number like 1.5.")
      covered.add("parcelWeightKg")
    } else if (parcelWeightKg > lookups.maxWeightKg) {
      push(`Parcel weight exceeds the ${lookups.maxWeightKg} KG limit.`)
      covered.add("parcelWeightKg")
    }
  }

  let productCost = Number.NaN
  const costRaw = values.product_cost.trim()
  if (!costRaw) {
    push("Product cost is required.")
    covered.add("productCost")
  } else {
    productCost = normalizeNumber(costRaw)
    if (Number.isNaN(productCost)) {
      push("Product cost must be a number like 1200.")
      covered.add("productCost")
    }
  }

  const deliveryType = (values.delivery_type.trim().toUpperCase() ||
    "STANDARD") as DeliveryType
  if (deliveryType !== "STANDARD" && deliveryType !== "FRAGILE") {
    push("Delivery type must be STANDARD or FRAGILE.")
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
      }))
    if (issues.length > 0) push(formatError({ issues }))
  }

  return { line, raw: values, input, errors }
}

/** Normalizes, resolves and validates every parsed row against §6. */
export function resolveRows(
  rows: RawOrderRow[],
  lookups: ResolveLookups,
): ResolvedRow[] {
  return rows.map((row) => resolveRow(row, lookups))
}
