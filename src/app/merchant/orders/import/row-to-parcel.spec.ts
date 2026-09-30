import { describe, expect, it } from "vitest"
import {
  type ResolveLookups,
  resolveRow,
} from "@/features/orders/bulk-import/resolve-rows"
import {
  type OrderImportHeader,
  orderImportHeaders,
} from "@/features/orders/bulk-import/template"
import {
  parcelStateToRawPatch,
  resolvedRowToParcelState,
} from "./row-to-parcel"

const myLocations = [{ id: "PKL-1", label: "Shop A" }]
const deliveryCities = [{ id: "DC-1", name: "Dhaka" }]

const lookups: ResolveLookups = {
  pickupLocations: [{ id: "PKL-1", name: "Shop A" }],
  deliveryCities: [{ id: "DC-1", name: "Dhaka" }],
}

function rawRow(partial: Partial<Record<OrderImportHeader, string>>, line = 2) {
  const values = {} as Record<OrderImportHeader, string>
  for (const header of orderImportHeaders) values[header] = ""
  return resolveRow(
    { __line: line, values: { ...values, ...partial } },
    lookups,
  )
}

function validRaw(
  partial: Partial<Record<OrderImportHeader, string>> = {},
  line = 2,
) {
  return rawRow(
    {
      pickup_location: "Shop A",
      recipient_name: "John Doe",
      recipient_phone: "01712345678",
      delivery_city: "Dhaka",
      delivery_address: "House 1 Road 1",
      parcel_weight_kg: "1.5",
      product_cost: "1200",
      delivery_type: "STANDARD",
      delivery_map_link: "https://maps.google.com/abc",
      merchant_note: "Handle with care",
      ...partial,
    },
    line,
  )
}

describe("resolvedRowToParcelState", () => {
  it("maps raw CSV cells onto a parcel with a stable row id", () => {
    const parcel = resolvedRowToParcelState(
      validRaw({}, 4),
      myLocations,
      deliveryCities,
    )
    expect(parcel).toEqual({
      id: "row-4",
      pickupLocationId: "PKL-1",
      recipientName: "John Doe",
      recipientPhone: "01712345678",
      deliveryCityId: "DC-1",
      deliveryAddress: "House 1 Road 1",
      parcelWeightKg: "1.5",
      productCost: "1200",
      deliveryType: "STANDARD",
      deliveryMapLink: "https://maps.google.com/abc",
      merchantNote: "Handle with care",
    })
  })

  it("resolves names the way resolveRow does (case and whitespace)", () => {
    const parcel = resolvedRowToParcelState(
      validRaw({ pickup_location: "  shop   a ", delivery_city: "DHAKA" }),
      myLocations,
      deliveryCities,
    )
    expect(parcel.pickupLocationId).toBe("PKL-1")
    expect(parcel.deliveryCityId).toBe("DC-1")
  })

  it("falls back to empty ids for unknown or blank lookups", () => {
    const unknown = resolvedRowToParcelState(
      validRaw({ pickup_location: "Ghost Shop", delivery_city: "Nowhere" }),
      myLocations,
      deliveryCities,
    )
    expect(unknown.pickupLocationId).toBe("")
    expect(unknown.deliveryCityId).toBe("")

    const blank = resolvedRowToParcelState(
      validRaw({ pickup_location: "", delivery_city: "" }),
      myLocations,
      deliveryCities,
    )
    expect(blank.pickupLocationId).toBe("")
    expect(blank.deliveryCityId).toBe("")
  })

  it("defaults an empty delivery type to STANDARD", () => {
    const parcel = resolvedRowToParcelState(
      validRaw({ delivery_type: "  fragile " }),
      myLocations,
      deliveryCities,
    )
    expect(parcel.deliveryType).toBe("FRAGILE")

    const empty = resolvedRowToParcelState(
      validRaw({ delivery_type: "" }),
      myLocations,
      deliveryCities,
    )
    expect(empty.deliveryType).toBe("STANDARD")
  })
})

describe("parcelStateToRawPatch", () => {
  it("maps scalar fields to their CSV headers", () => {
    const raw = validRaw().raw
    expect(
      parcelStateToRawPatch(
        "recipientName",
        "Jane Doe",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ recipient_name: "Jane Doe" })
    expect(
      parcelStateToRawPatch(
        "parcelWeightKg",
        "2.5",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ parcel_weight_kg: "2.5" })
    expect(
      parcelStateToRawPatch(
        "deliveryType",
        "FRAGILE",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ delivery_type: "FRAGILE" })
  })

  it("maps ids back to the pickup label and the city name", () => {
    const raw = validRaw().raw
    expect(
      parcelStateToRawPatch(
        "pickupLocationId",
        "PKL-1",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ pickup_location: "Shop A" })
    expect(
      parcelStateToRawPatch(
        "deliveryCityId",
        "DC-1",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ delivery_city: "Dhaka" })
    expect(
      parcelStateToRawPatch(
        "pickupLocationId",
        "",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ pickup_location: "" })
  })

  it("keeps the previous CSV text for an id it does not know", () => {
    const raw = validRaw({ pickup_location: "Ghost Shop" }).raw
    expect(
      parcelStateToRawPatch(
        "pickupLocationId",
        "PKL-999",
        raw,
        myLocations,
        deliveryCities,
      ),
    ).toEqual({ pickup_location: "Ghost Shop" })
  })

  it("is a no-op for the parcel id", () => {
    const raw = validRaw().raw
    expect(
      parcelStateToRawPatch("id", "row-7", raw, myLocations, deliveryCities),
    ).toEqual({})
  })

  it("round-trips a resolved row through both directions", () => {
    const row = validRaw({}, 3)
    const parcel = resolvedRowToParcelState(row, myLocations, deliveryCities)

    const nextRaw = { ...row.raw }
    const edits = [
      ["pickupLocationId", parcel.pickupLocationId],
      ["recipientName", parcel.recipientName],
      ["recipientPhone", parcel.recipientPhone],
      ["deliveryCityId", parcel.deliveryCityId],
      ["deliveryAddress", parcel.deliveryAddress],
      ["parcelWeightKg", parcel.parcelWeightKg],
      ["productCost", parcel.productCost],
      ["deliveryType", parcel.deliveryType],
      ["deliveryMapLink", parcel.deliveryMapLink],
      ["merchantNote", parcel.merchantNote],
    ] as const
    for (const [key, value] of edits) {
      Object.assign(
        nextRaw,
        parcelStateToRawPatch(key, value, nextRaw, myLocations, deliveryCities),
      )
    }

    expect(nextRaw).toEqual(row.raw)
  })
})
