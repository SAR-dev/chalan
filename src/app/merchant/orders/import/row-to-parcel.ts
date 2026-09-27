/**
 * Bulk-import preview ⇄ order-create parcel adapters. The preview renders the
 * order-create `ParcelCard`, so each `ResolvedRow` is projected to a
 * `ParcelState` (CSV header names → IDs) and in-card edits are mapped back to
 * a raw CSV patch that `resolveRow` re-validates. Pure module: the name/ID
 * lookups are injected by the caller.
 */

import type { ResolvedRow } from "@/features/orders/bulk-import/resolve-rows"
import type { OrderImportHeader } from "@/features/orders/bulk-import/template"
import type { DeliveryType } from "@/lib/types"
import type { ParcelState } from "../new/types"

export interface NameLookup {
  id: string
  label: string
}

export interface CityLookup {
  id: string
  name: string
}

/** `ParcelState` field → the CSV header holding its value. */
const HEADER_BY_KEY: Partial<Record<keyof ParcelState, OrderImportHeader>> = {
  pickupLocationId: "pickup_location",
  recipientName: "recipient_name",
  recipientPhone: "recipient_phone",
  deliveryCityId: "delivery_city",
  deliveryAddress: "delivery_address",
  parcelWeightKg: "parcel_weight_kg",
  productCost: "product_cost",
  deliveryType: "delivery_type",
  deliveryMapLink: "delivery_map_link",
  merchantNote: "merchant_note",
}

/** Same name matching `resolveRow` uses: whitespace-collapsed, case-insensitive. */
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function idByName<T extends { id: string }>(
  options: ReadonlyArray<T>,
  name: string,
  labelOf: (option: T) => string,
): string {
  const needle = normalizeName(name)
  if (!needle) return ""
  const found = options.find(
    (option) => normalizeName(labelOf(option)) === needle,
  )
  return found?.id ?? ""
}

function nameById<T extends { id: string }>(
  options: ReadonlyArray<T>,
  id: string,
  labelOf: (option: T) => string,
  fallback: string,
): string {
  if (id === "") return ""
  const found = options.find((option) => option.id === id)
  return found ? labelOf(found) : fallback
}

/** CSV row → the parcel the shared `ParcelCard` edits (stable `row-{line}` id). */
export function resolvedRowToParcelState(
  row: ResolvedRow,
  myLocations: ReadonlyArray<NameLookup>,
  deliveryCities: ReadonlyArray<CityLookup>,
): ParcelState {
  const raw = row.raw
  return {
    id: `row-${row.line}`,
    pickupLocationId: idByName(
      myLocations,
      raw.pickup_location,
      (option) => option.label,
    ),
    recipientName: raw.recipient_name,
    recipientPhone: raw.recipient_phone,
    deliveryCityId: idByName(
      deliveryCities,
      raw.delivery_city,
      (option) => option.name,
    ),
    deliveryAddress: raw.delivery_address,
    parcelWeightKg: raw.parcel_weight_kg,
    productCost: raw.product_cost,
    deliveryType: (raw.delivery_type.trim().toUpperCase() ||
      "STANDARD") as DeliveryType,
    deliveryMapLink: raw.delivery_map_link,
    merchantNote: raw.merchant_note,
  }
}

/**
 * `ParcelCard` field edit → the raw CSV cells it changes. `pickupLocationId`
 * and `deliveryCityId` are mapped back to their label / city name; an id we
 * don't recognize keeps the previous CSV text so the row keeps reporting the
 * unknown value instead of silently blanking it.
 */
export function parcelStateToRawPatch(
  key: keyof ParcelState,
  value: string,
  prevRaw: Record<OrderImportHeader, string>,
  myLocations: ReadonlyArray<NameLookup>,
  deliveryCities: ReadonlyArray<CityLookup>,
): Partial<Record<OrderImportHeader, string>> {
  const patch: Partial<Record<OrderImportHeader, string>> = {}
  if (key === "pickupLocationId") {
    patch.pickup_location = nameById(
      myLocations,
      value,
      (option) => option.label,
      prevRaw.pickup_location,
    )
    return patch
  }
  if (key === "deliveryCityId") {
    patch.delivery_city = nameById(
      deliveryCities,
      value,
      (option) => option.name,
      prevRaw.delivery_city,
    )
    return patch
  }
  const header = HEADER_BY_KEY[key]
  if (!header) return {}
  patch[header] = value
  return patch
}
