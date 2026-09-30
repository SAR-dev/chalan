/**
 * CSV import template format. The canonical column order, the forgiving
 * header aliases, and the two CSV builders (template + error export).
 * Parsing lives in `csv-parse.ts`; row resolution in `resolve-rows.ts`.
 *
 * This file is the specification: there is no separate document. The column
 * list, the aliases and the required/optional split all live below, and the
 * tests in `template.spec.ts` pin them.
 */

import { toCsv } from "@/lib/csv"

/** Canonical header order — also the column order of every generated CSV. */
export const orderImportHeaders = [
  "pickup_location",
  "recipient_name",
  "recipient_phone",
  "delivery_city",
  "delivery_address",
  "parcel_weight_kg",
  "item_type",
  "product_cost",
  "delivery_type",
  "delivery_map_link",
  "merchant_note",
] as const

export type OrderImportHeader = (typeof orderImportHeaders)[number]

/** The first seven columns are mandatory in every imported file. */
export const requiredImportHeaders: readonly OrderImportHeader[] = [
  "pickup_location",
  "recipient_name",
  "recipient_phone",
  "delivery_city",
  "delivery_address",
  "parcel_weight_kg",
  "product_cost",
]

/** Alias → canonical header, matched against the normalized header name. */
export const headerAliases: Record<string, OrderImportHeader> = {
  pickup: "pickup_location",
  pickup_point: "pickup_location",
  pickup_name: "pickup_location",
  name: "recipient_name",
  customer_name: "recipient_name",
  recipient: "recipient_name",
  customer: "recipient_name",
  phone: "recipient_phone",
  mobile: "recipient_phone",
  recipient_mobile: "recipient_phone",
  customer_phone: "recipient_phone",
  city: "delivery_city",
  address: "delivery_address",
  recipient_address: "delivery_address",
  weight: "parcel_weight_kg",
  weight_kg: "parcel_weight_kg",
  parcel_weight: "parcel_weight_kg",
  // `item` and `items` map here too. Someone whose sheet says "items" is almost
  // certainly describing contents, and the alternative is rejecting their whole
  // file over a column they filled in correctly.
  item: "item_type",
  items: "item_type",
  item_name: "item_type",
  product: "item_type",
  product_name: "item_type",
  goods: "item_type",
  contents: "item_type",
  cod: "product_cost",
  cod_amount: "product_cost",
  amount: "product_cost",
  price: "product_cost",
  product_price: "product_cost",
  type: "delivery_type",
  map_link: "delivery_map_link",
  map: "delivery_map_link",
  location_link: "delivery_map_link",
  note: "merchant_note",
  notes: "merchant_note",
  remarks: "merchant_note",
}

/** Lower-cases, trims, and replaces spaces/hyphens with underscores. */
export function normalizeImportHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

/** Maps a raw header to its canonical column, or null when unrecognized. */
export function resolveImportHeader(header: string): OrderImportHeader | null {
  const normalized = normalizeImportHeader(header)
  if ((orderImportHeaders as readonly string[]).includes(normalized)) {
    return normalized as OrderImportHeader
  }
  return headerAliases[normalized] ?? null
}

/** Used when the merchant has no pickup locations yet. */
export const PLACEHOLDER_PICKUP_LOCATION = "MY PICKUP LOCATION"

export interface TemplateSample {
  pickupLocation?: string
  deliveryCity?: string
}

/** Builds the downloadable template: header row + one dynamic sample row. */
export function buildTemplateCsv(sample?: TemplateSample): string {
  const values: Record<OrderImportHeader, string> = {
    pickup_location:
      sample?.pickupLocation?.trim() || PLACEHOLDER_PICKUP_LOCATION,
    recipient_name: "John Doe",
    recipient_phone: "01712345678",
    delivery_city: sample?.deliveryCity?.trim() || "Dhaka",
    delivery_address: "House 1 Road 1 Dhanmondi Dhaka",
    parcel_weight_kg: "1.5",
    // Prefilled rather than blank: an empty optional column in a template reads
    // as "this import does not support it", and most merchants would delete the
    // column instead of discovering what it was for. One realistic example is
    // enough to convey both the existence and the shape of the field.
    item_type: "Cotton saree",
    product_cost: "1200",
    delivery_type: "STANDARD",
    delivery_map_link: "",
    merchant_note: "fragile packaging",
  }
  return toCsv(
    [orderImportHeaders.map((header) => values[header])],
    [...orderImportHeaders],
  )
}

export interface ErrorCsvRow {
  values: Record<string, string>
  error: string
}

/** Builds the fix-and-retry CSV: original columns plus an `error` column. */
export function buildErrorCsv(rows: ErrorCsvRow[]): string {
  const headers = [...orderImportHeaders, "error"]
  const body = rows.map((row) => [
    ...orderImportHeaders.map((header) => row.values[header] ?? ""),
    row.error,
  ])
  return toCsv(body, headers)
}
