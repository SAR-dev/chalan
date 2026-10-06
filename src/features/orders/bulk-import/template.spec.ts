import { describe, expect, it } from "vitest"
import { parseImportText } from "./csv-parse"
import {
  buildErrorCsv,
  buildTemplateCsv,
  headerAliases,
  orderImportHeaders,
  PLACEHOLDER_PICKUP_LOCATION,
  requiredImportHeaders,
} from "./template"

describe("orderImportHeaders", () => {
  it("matches the canonical column order", () => {
    expect([...orderImportHeaders]).toEqual([
      "pickup_location",
      "recipient_name",
      "recipient_phone",
      "recipient_mail",
      "delivery_city",
      "delivery_address",
      "parcel_weight_kg",
      "item_type",
      "product_cost",
      "delivery_type",
      "delivery_map_link",
      "merchant_note",
    ])
  })

  it("requires the seven columns that identify a deliverable parcel", () => {
    // `item_type` is deliberately NOT required even though it sits between
    // required columns in the canonical order. Requiring it would reject every
    // file imported before it existed, and the field is descriptive — an
    // order with no stated contents is still a valid order. `recipient_mail`
    // is likewise optional: a merchant who only ever collects a phone number
    // must keep importing unchanged.
    expect(requiredImportHeaders).toHaveLength(7)
    expect([...requiredImportHeaders]).toEqual([
      "pickup_location",
      "recipient_name",
      "recipient_phone",
      "delivery_city",
      "delivery_address",
      "parcel_weight_kg",
      "product_cost",
    ])
  })

  it("maps every documented alias to its canonical header", () => {
    expect(headerAliases).toEqual({
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
      email: "recipient_mail",
      mail: "recipient_mail",
      recipient_email: "recipient_mail",
      customer_email: "recipient_mail",
      city: "delivery_city",
      address: "delivery_address",
      recipient_address: "delivery_address",
      weight: "parcel_weight_kg",
      weight_kg: "parcel_weight_kg",
      parcel_weight: "parcel_weight_kg",
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
    })
  })
})

describe("buildTemplateCsv", () => {
  it("round-trips through the parser to one valid row", () => {
    const result = parseImportText(buildTemplateCsv())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].__line).toBe(2)
    expect(result.rows[0].values).toEqual({
      pickup_location: PLACEHOLDER_PICKUP_LOCATION,
      recipient_name: "John Doe",
      recipient_phone: "01712345678",
      recipient_mail: "johndoe@example.com",
      delivery_city: "Dhaka",
      delivery_address: "House 1 Road 1 Dhanmondi Dhaka",
      parcel_weight_kg: "1.5",
      item_type: "Cotton saree",
      product_cost: "1200",
      delivery_type: "STANDARD",
      delivery_map_link: "",
      merchant_note: "fragile packaging",
    })
  })

  it("prefills the optional item_type so the column is not deleted unused", () => {
    // An empty optional column in a template reads as "this import does not
    // support it", and merchants delete it rather than find out what it was for.
    const result = parseImportText(buildTemplateCsv())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].values.item_type).toBe("Cotton saree")
  })

  it("fills the sample row from the merchant's lookups", () => {
    const result = parseImportText(
      buildTemplateCsv({
        pickupLocation: "Merchant 1 Pickup",
        deliveryCity: "Chittagong",
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].values.pickup_location).toBe("Merchant 1 Pickup")
    expect(result.rows[0].values.delivery_city).toBe("Chittagong")
  })
})

describe("buildErrorCsv", () => {
  it("emits original columns plus an error column that re-parses cleanly", () => {
    const template = parseImportText(buildTemplateCsv())
    expect(template.ok).toBe(true)
    if (!template.ok) return

    const csv = buildErrorCsv([
      {
        values: template.rows[0].values,
        error: `Row 2: Unknown pickup location "${PLACEHOLDER_PICKUP_LOCATION}".`,
      },
    ])

    const [headerRow, sampleRow] = csv.split("\r\n")
    expect(headerRow.split(",")).toEqual([...orderImportHeaders, "error"])
    expect(sampleRow).toContain("Unknown pickup location")

    const result = parseImportText(csv)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].values).toEqual(template.rows[0].values)
  })
})
