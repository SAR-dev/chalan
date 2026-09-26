import { describe, expect, it } from "vitest"
import { type ParcelQuoteArgs, quoteParcel } from "./quote-parcel"

const pickupLocations = [
  { id: "PKL-1", cityId: "CTY-A" },
  { id: "PKL-2", cityId: "CTY-B" },
]

const deliveryCities = [
  { id: "CTY-A", name: "Dhaka", zoneId: "ZN-1" },
  { id: "CTY-B", name: "Chattogram", zoneId: "ZN-2" },
  { id: "CTY-C", name: "Sylhet", zoneId: "ZN-3" },
]

const merchant = {
  baseRate: 60,
  extraRatePerKg: 20,
  freeWeightKg: 2,
  maxWeightKg: 30,
  codFeePercentage: 1,
}

/** Dhaka (ZN-1) → Chattogram (ZN-2). */
const zonePricing = [
  {
    id: "ZP-1",
    fromZoneId: "ZN-1",
    toZoneId: "ZN-2",
    baseRate: 100,
    extraRatePerKg: 30,
    freeWeightKg: 5,
    maxWeightKg: 25,
    codFeePercentage: 2,
  },
]

function args(overrides: Partial<ParcelQuoteArgs> = {}): ParcelQuoteArgs {
  return {
    pickupLocationId: "PKL-1",
    deliveryCityId: "CTY-B",
    parcelWeightKg: "1",
    productCost: "1000",
    pickupLocations,
    deliveryCities,
    zonePricing,
    currentMerchant: merchant,
    ...overrides,
  }
}

describe("quoteParcel", () => {
  it("falls back to the merchant's flat rate when there is no zone pricing", () => {
    const quote = quoteParcel(args({ zonePricing: [] }))
    expect(quote.isZonePricing).toBe(false)
    expect(quote.breakdown).toEqual({
      baseRate: 60,
      billableExtraKg: 0,
      extraWeightCharge: 0,
      total: 60,
      exceedsMax: false,
    })
    expect(quote.deliveryCharge).toBe(60)
  })

  it("uses the origin→destination zone price when it matches", () => {
    const quote = quoteParcel(args({ parcelWeightKg: "6" }))
    expect(quote.isZonePricing).toBe(true)
    // 100 base + ceil(6 − 5) × 30
    expect(quote.deliveryCharge).toBe(130)
    expect(quote.breakdown?.baseRate).toBe(100)
  })

  it("falls back to merchant pricing when the destination has no zone price", () => {
    const quote = quoteParcel(args({ deliveryCityId: "CTY-C" }))
    expect(quote.isZonePricing).toBe(false)
    expect(quote.deliveryCharge).toBe(60)
  })

  it("flags an overweight parcel against the applied pricing", () => {
    const merchantQuote = quoteParcel(
      args({ zonePricing: [], parcelWeightKg: "31" }),
    )
    expect(merchantQuote.exceedsMax).toBe(true)

    const zoneQuote = quoteParcel(args({ parcelWeightKg: "26" }))
    expect(zoneQuote.exceedsMax).toBe(true)
    expect(zoneQuote.isZonePricing).toBe(true)
  })

  it("charges the COD fee at the merchant percentage without a zone price", () => {
    const quote = quoteParcel(args({ zonePricing: [], productCost: "2000" }))
    expect(quote.productCost).toBe(2000)
    expect(quote.codFee).toBe(20)
  })

  it("prefers the zone COD fee percentage when a zone price applies", () => {
    const quote = quoteParcel(args({ productCost: "2000" }))
    expect(quote.codFee).toBe(40)
  })

  it("treats a blank weight and a non-numeric cost as zero", () => {
    const quote = quoteParcel(
      args({ zonePricing: [], parcelWeightKg: "", productCost: "heavy" }),
    )
    expect(quote.weight).toBe(0)
    expect(quote.productCost).toBe(0)
    expect(quote.codFee).toBe(0)
    expect(quote.deliveryCharge).toBe(60)
    expect(quote.exceedsMax).toBe(false)
  })

  it("quotes nothing when there is no merchant and no zone price", () => {
    const quote = quoteParcel(
      args({ zonePricing: [], currentMerchant: null, parcelWeightKg: "10" }),
    )
    expect(quote.breakdown).toBeNull()
    expect(quote.deliveryCharge).toBe(0)
    expect(quote.codFee).toBe(0)
    expect(quote.exceedsMax).toBe(false)
    expect(quote.isZonePricing).toBe(false)
  })

  it("resolves the origin zone from the parcel's own pickup location", () => {
    // PKL-2 sits in Chattogram (ZN-2): ZN-2 → ZN-2 has no price row.
    const quote = quoteParcel(args({ pickupLocationId: "PKL-2" }))
    expect(quote.isZonePricing).toBe(false)
    expect(quote.deliveryCharge).toBe(60)
  })
})
