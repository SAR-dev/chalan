import { describe, expect, it } from "vitest"
import type { RawOrderRow } from "./csv-parse"
import {
  normalizeNumber,
  normalizePhone,
  resolveRow,
  resolveRows,
} from "./resolve-rows"
import { type OrderImportHeader, orderImportHeaders } from "./template"

const lookups = {
  pickupLocations: [{ id: "PKL-1", name: "Shop A" }],
  deliveryCities: [{ id: "DC-1", name: "Dhaka" }],
  maxWeightKg: 10,
}

function row(
  partial: Partial<Record<OrderImportHeader, string>>,
  line = 2,
): RawOrderRow {
  const values = {} as Record<OrderImportHeader, string>
  for (const header of orderImportHeaders) values[header] = ""
  return { __line: line, values: { ...values, ...partial } }
}

function validRow(
  partial: Partial<Record<OrderImportHeader, string>> = {},
  line = 2,
) {
  return row(
    {
      pickup_location: "Shop A",
      recipient_name: "John Doe",
      recipient_phone: "01712345678",
      delivery_city: "Dhaka",
      delivery_address: "House 1 Road 1",
      parcel_weight_kg: "1.5",
      product_cost: "1200",
      ...partial,
    },
    line,
  )
}

describe("name resolution", () => {
  it("resolves case-insensitively with collapsed whitespace", () => {
    const [resolved] = resolveRows(
      [validRow({ pickup_location: "  shop   a " })],
      lookups,
    )
    expect(resolved.errors).toEqual([])
    expect(resolved.input.pickupLocationId).toBe("PKL-1")
    expect(resolved.input.deliveryCityId).toBe("DC-1")
  })

  it("reports unknown names with the original spelling", () => {
    const [resolved] = resolveRows(
      [validRow({ pickup_location: "Ghost Shop", delivery_city: "Nowhere" })],
      lookups,
    )
    expect(resolved.errors).toEqual([
      'Row 2: Unknown pickup location "Ghost Shop".',
      'Row 2: Unknown delivery city "Nowhere".',
    ])
    expect(resolved.input.pickupLocationId).toBe("")
  })
})

describe("phone normalization", () => {
  it("converts +880, dashes and Bangla digits to 01…", () => {
    expect(normalizePhone("+8801712345678")).toBe("01712345678")
    expect(normalizePhone("+881712345678")).toBe("01712345678")
    expect(normalizePhone("017-1234-5678")).toBe("01712345678")
    expect(normalizePhone("017 1234 5678")).toBe("01712345678")
    expect(normalizePhone("০১৭১২৩৪৫৬৭৮")).toBe("01712345678")
    expect(normalizePhone("8801712345678")).toBe("01712345678")
    expect(normalizePhone("1712345678")).toBe("01712345678")
    expect(normalizePhone("")).toBe("")
  })

  it("accepts normalized phones and rejects invalid ones with a row number", () => {
    const good = resolveRows(
      [validRow({ recipient_phone: "+8801712345678" })],
      lookups,
    )
    expect(good[0].errors).toEqual([])
    expect(good[0].input.recipientPhone).toBe("01712345678")

    const bad = resolveRows(
      [validRow({ recipient_phone: "12345" }, 7)],
      lookups,
    )
    expect(bad[0].errors).toHaveLength(1)
    expect(bad[0].errors[0]).toContain("Row 7:")
    expect(bad[0].errors[0]).toContain("Recipient Phone")
  })
})

describe("numeric parsing", () => {
  it("parses decimal commas, thousands separators and Bangla numerals", () => {
    expect(normalizeNumber("1,5")).toBe(1.5)
    expect(normalizeNumber("1.5")).toBe(1.5)
    expect(normalizeNumber("৳1,200")).toBe(1200)
    expect(normalizeNumber("TK 500")).toBe(500)
    expect(normalizeNumber("১২০০")).toBe(1200)
    expect(normalizeNumber("1,200.50")).toBe(1200.5)
    expect(Number.isNaN(normalizeNumber("abc"))).toBe(true)
  })

  it("feeds normalized numbers into the row input", () => {
    const [resolved] = resolveRows(
      [validRow({ parcel_weight_kg: "1,5", product_cost: "৳1,200" })],
      lookups,
    )
    expect(resolved.errors).toEqual([])
    expect(resolved.input.parcelWeightKg).toBe(1.5)
    expect(resolved.input.productCost).toBe(1200)
  })

  it("flags non-numeric values with an example format", () => {
    const [weight] = resolveRows(
      [validRow({ parcel_weight_kg: "heavy" }, 4)],
      lookups,
    )
    expect(weight.errors).toEqual([
      "Row 4: Parcel weight must be a number like 1.5.",
    ])
    const [cost] = resolveRows([validRow({ product_cost: "free" }, 5)], lookups)
    expect(cost.errors).toEqual([
      "Row 5: Product cost must be a number like 1200.",
    ])
  })
})

describe("note auto-tag", () => {
  it("tags an empty note with today's CSV import marker", () => {
    const [resolved] = resolveRows([validRow({ merchant_note: "" })], lookups)
    expect(resolved.errors).toEqual([])
    expect(resolved.input.merchantNote).toMatch(
      /^\[CSV import \d{4}-\d{2}-\d{2}\]$/,
    )
  })

  it("never modifies a merchant-provided note", () => {
    const [resolved] = resolveRows(
      [validRow({ merchant_note: " handle with care " })],
      lookups,
    )
    expect(resolved.input.merchantNote).toBe("handle with care")
  })
})

describe("row validation", () => {
  it("defaults delivery type and normalizes optional fields", () => {
    const [resolved] = resolveRows([validRow()], lookups)
    expect(resolved.errors).toEqual([])
    expect(resolved.input.deliveryType).toBe("STANDARD")
    expect(resolved.input.deliveryMapLink).toBeNull()
    expect(resolved.input.deliveryAddress).toBe("House 1 Road 1")
  })

  it("flattens zod issues into Row N instructions", () => {
    const [resolved] = resolveRows(
      [
        validRow(
          { recipient_name: "", recipient_phone: "", parcel_weight_kg: "0" },
          14,
        ),
      ],
      lookups,
    )
    expect(resolved.errors).toHaveLength(1)
    expect(resolved.errors[0]).toMatch(/^Row 14: /)
    expect(resolved.errors[0]).toContain("Recipient name")
    expect(resolved.errors[0]).toContain("Recipient phone")
  })

  it("keeps resolution errors and zod errors separate per row", () => {
    const [resolved] = resolveRows(
      [validRow({ pickup_location: "Ghost Shop" }, 3)],
      lookups,
    )
    expect(resolved.errors).toEqual([
      'Row 3: Unknown pickup location "Ghost Shop".',
    ])
  })

  it("does not validate weight against a merchant limit", () => {
    // The limit belongs to the route and depends on both endpoints of the row,
    // neither of which is known while parsing a CSV cell — so it is resolved by
    // `quoteParcel` and reported from the preview instead.
    const [resolved] = resolveRows(
      [validRow({ parcel_weight_kg: "50" }, 9)],
      lookups,
    )
    expect(resolved.errors).toEqual([])
  })

  it("accepts a fully valid row", () => {
    const rows = resolveRows(
      [validRow({}, 2), validRow({ recipient_name: "Jane" }, 3)],
      lookups,
    )
    expect(rows.every((r) => r.errors.length === 0)).toBe(true)
    expect(rows[1].input.recipientName).toBe("Jane")
  })
})

describe("field-level error attribution (inline cell errors)", () => {
  it("attributes an invalid phone to the recipient_phone cell", () => {
    const [resolved] = resolveRows(
      [validRow({ recipient_phone: "12345" }, 6)],
      lookups,
    )
    expect(Object.keys(resolved.fieldErrors)).toEqual(["recipient_phone"])
    expect(resolved.fieldErrors.recipient_phone).toContain(
      "Invalid Bangladeshi phone number",
    )
    expect(resolved.errors).toHaveLength(1)
  })

  it("attributes an unknown delivery city to the delivery_city cell", () => {
    const [resolved] = resolveRows(
      [
        validRow(
          { delivery_city: "Nowhere", pickup_location: "Ghost Shop" },
          7,
        ),
      ],
      lookups,
    )
    expect(resolved.fieldErrors.delivery_city).toBe(
      'Unknown delivery city "Nowhere".',
    )
    expect(resolved.fieldErrors.pickup_location).toBe(
      'Unknown pickup location "Ghost Shop".',
    )
    expect(resolved.fieldErrors.recipient_phone).toBeUndefined()
    expect(resolved.errors).toEqual([
      'Row 7: Unknown pickup location "Ghost Shop".',
      'Row 7: Unknown delivery city "Nowhere".',
    ])
  })

  it("attributes an unparseable weight to parcel_weight_kg", () => {
    const [bad] = resolveRows(
      [validRow({ parcel_weight_kg: "heavy" }, 9)],
      lookups,
    )
    expect(bad.fieldErrors.parcel_weight_kg).toBe(
      "Parcel weight must be a number like 1.5.",
    )
    expect(Object.keys(bad.fieldErrors)).toEqual(["parcel_weight_kg"])

    // A merely heavy row has no field error: the route's limit is not a CSV
    // rule, so it does not surface here.
    const [heavy] = resolveRows(
      [validRow({ parcel_weight_kg: "50" }, 9)],
      lookups,
    )
    expect(heavy.fieldErrors).toEqual({})

    const [clean] = resolveRows([validRow()], lookups)
    expect(clean.fieldErrors).toEqual({})
  })
})

describe("single-row re-resolution (editable preview)", () => {
  it("re-validates one edited cell without touching line or raw cells", () => {
    const original = resolveRow(
      validRow({ recipient_phone: "12345" }, 5),
      lookups,
    )
    expect(original.errors).toHaveLength(1)

    const edited = resolveRow(
      {
        __line: original.line,
        values: { ...original.raw, recipient_phone: "01712345678" },
      },
      lookups,
    )
    expect(edited.errors).toEqual([])
    expect(edited.line).toBe(5)
    expect(edited.raw.recipient_phone).toBe("01712345678")
    expect(edited.input.recipientPhone).toBe("01712345678")
    expect(edited.raw.recipient_name).toBe(original.raw.recipient_name)
  })

  it("turns a raw cell edit into a fresh lookup error", () => {
    const [resolved] = resolveRows([validRow({}, 4)], lookups)
    const edited = resolveRow(
      {
        __line: resolved.line,
        values: { ...resolved.raw, delivery_city: "Nowhere" },
      },
      lookups,
    )
    expect(edited.errors).toEqual(['Row 4: Unknown delivery city "Nowhere".'])
    expect(edited.input.deliveryCityId).toBe("")
  })

  it("keeps an auto-tagged note stable across a re-resolve", () => {
    const [resolved] = resolveRows([validRow({ merchant_note: "" })], lookups)
    const again = resolveRow(
      { __line: resolved.line, values: { ...resolved.raw } },
      lookups,
    )
    expect(again.input.merchantNote).toBe(resolved.input.merchantNote)
  })
})
