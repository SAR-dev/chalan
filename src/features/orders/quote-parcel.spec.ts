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

/**
 * A pickup location whose city is not in the delivery-city list. `zoneId` is
 * NOT NULL in the schema, so "no zone" is not representable here — an
 * unresolvable *origin* can only mean the city was never resolved.
 */
const pickupLocationsWithUnknownCity = [
  { id: "PKL-1", cityId: "CTY-A" },
  { id: "PKL-3", cityId: "CTY-MISSING" },
]

const zones = [
  { id: "ZN-1", name: "Dhaka Metro" },
  { id: "ZN-2", name: "Chattogram" },
  { id: "ZN-3", name: "Sylhet" },
]

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
    cancellationFee: 8,
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
    zones,
    ...overrides,
  }
}

describe("quoteParcel", () => {
  it("uses the origin→destination zone price when it matches", () => {
    const quote = quoteParcel(args({ parcelWeightKg: "6" }))
    expect(quote.pricingUnavailable).toBe(false)
    // 100 base + ceil(6 − 5) × 30
    expect(quote.deliveryCharge).toBe(130)
    expect(quote.breakdown?.baseRate).toBe(100)
    expect(quote.cancellationFee).toBe(8)
  })

  it("charges nothing and flags the lane when no zone row exists", () => {
    // The core of the change: a lane with no rate is NOT quoted from a
    // platform default. It is reported so the form can block the submit.
    const quote = quoteParcel(args({ zonePricing: [] }))
    expect(quote.pricingUnavailable).toBe(true)
    expect(quote.pricingUnavailableReason).toBe("no-pricing-for-lane")
    expect(quote.breakdown).toBeNull()
    expect(quote.deliveryCharge).toBe(0)
    expect(quote.codFee).toBe(0)
    expect(quote.cancellationFee).toBe(0)
  })

  it("names both zones in the failure so the message is actionable", () => {
    const quote = quoteParcel(args({ zonePricing: [] }))
    expect(quote.fromZone).toEqual({ id: "ZN-1", name: "Dhaka Metro" })
    expect(quote.toZone).toEqual({ id: "ZN-2", name: "Chattogram" })
  })

  it("flags the lane when the destination zone has no price", () => {
    const quote = quoteParcel(args({ deliveryCityId: "CTY-C" }))
    expect(quote.pricingUnavailable).toBe(true)
    expect(quote.pricingUnavailableReason).toBe("no-pricing-for-lane")
    expect(quote.deliveryCharge).toBe(0)
  })

  it("flags the origin when the pickup location's city cannot be resolved", () => {
    const quote = quoteParcel(
      args({
        pickupLocations: pickupLocationsWithUnknownCity,
        pickupLocationId: "PKL-3",
      }),
    )
    expect(quote.pricingUnavailable).toBe(true)
    expect(quote.pricingUnavailableReason).toBe("origin-zone-unknown")
    expect(quote.fromZone).toBeNull()
  })

  it("flags an unknown delivery city", () => {
    const quote = quoteParcel(args({ deliveryCityId: "" }))
    expect(quote.pricingUnavailable).toBe(true)
    expect(quote.pricingUnavailableReason).toBe("destination-city-unknown")
  })

  it("still reports no reason when the lane is priced", () => {
    const quote = quoteParcel(args())
    expect(quote.pricingUnavailableReason).toBeNull()
  })

  it("falls back to generic zone names when no zone list is supplied", () => {
    const quote = quoteParcel(args({ zonePricing: [], zones: undefined }))
    expect(quote.pricingUnavailableReason).toBe("no-pricing-for-lane")
    // Unresolvable to a name — the message degrades rather than lying.
    expect(quote.fromZone).toBeNull()
  })

  it("reports no weight limit when the lane is unpriced", () => {
    // There is no merchant cap left to fall back to, and inventing "0 KG max"
    // would be a second lie on top of the missing rate — the lane error is what
    // the form shows instead.
    const quote = quoteParcel(args({ zonePricing: [], parcelWeightKg: "6" }))
    expect(quote.maxWeightKg).toBe(0)
    expect(quote.exceedsMax).toBe(false)
    expect(quote.pricingUnavailable).toBe(true)
  })

  it("flags an overweight parcel against the rate's own max", () => {
    const zoneQuote = quoteParcel(args({ parcelWeightKg: "26" }))
    expect(zoneQuote.exceedsMax).toBe(true)
    expect(zoneQuote.pricingUnavailable).toBe(false)
  })

  it("takes the weight limit from the lane alone", () => {
    // 25 KG is the fixture lane's `maxWeightKg`, and it is the only cap: there
    // is no per-merchant limit to intersect it with.
    const quote = quoteParcel(args({ parcelWeightKg: "25" }))
    expect(quote.maxWeightKg).toBe(25)
    expect(quote.exceedsMax).toBe(false)
  })

  it("charges the COD fee at the lane's percentage", () => {
    const quote = quoteParcel(args({ productCost: "2000" }))
    expect(quote.productCost).toBe(2000)
    expect(quote.codFee).toBe(40)
  })

  it("treats a blank weight and a non-numeric cost as zero", () => {
    const quote = quoteParcel(
      args({ parcelWeightKg: "", productCost: "heavy" }),
    )
    expect(quote.weight).toBe(0)
    expect(quote.productCost).toBe(0)
    expect(quote.codFee).toBe(0)
    expect(quote.exceedsMax).toBe(false)
  })

  it("resolves the origin zone from the parcel's own pickup location", () => {
    // PKL-2 sits in Chattogram (ZN-2): ZN-2 → ZN-2 has no price row.
    const quote = quoteParcel(args({ pickupLocationId: "PKL-2" }))
    expect(quote.pricingUnavailable).toBe(true)
    expect(quote.fromZone).toEqual({ id: "ZN-2", name: "Chattogram" })
  })

  it("applies a FLAT bundle rule to the delivery fee only", () => {
    // Zone fee is 130 (100 base + 1 extra KG × 30); FLAT 50 replaces it.
    const quote = quoteParcel(
      args({
        parcelWeightKg: "6",
        packageRule: { ruleType: "FLAT", ruleValue: 50 },
      }),
    )
    expect(quote.deliveryChargeBeforePackage).toBe(130)
    expect(quote.deliveryCharge).toBe(50)
    expect(quote.packageDiscountApplied).toBe(true)
    // COD and cancellation fees are untouched by a bundle.
    expect(quote.codFee).toBe(20)
    expect(quote.cancellationFee).toBe(8)
  })

  it("applies a PERCENT_OFF bundle rule to the delivery fee", () => {
    const quote = quoteParcel(
      args({
        parcelWeightKg: "6",
        packageRule: { ruleType: "PERCENT_OFF", ruleValue: 25 },
      }),
    )
    // 130 − 25% = 97.5
    expect(quote.deliveryCharge).toBe(97.5)
    expect(quote.packageDiscountApplied).toBe(true)
  })

  it("never charges more than the zone fee under a FLAT rule", () => {
    // A FLAT rule above the zone fee must not raise the price.
    const quote = quoteParcel(
      args({
        parcelWeightKg: "6",
        packageRule: { ruleType: "FLAT", ruleValue: 9999 },
      }),
    )
    expect(quote.deliveryCharge).toBe(130)
    expect(quote.packageDiscountApplied).toBe(false)
  })

  it("reports no discount when there is no bundle rule", () => {
    const quote = quoteParcel(args({ parcelWeightKg: "6" }))
    expect(quote.deliveryCharge).toBe(130)
    expect(quote.deliveryChargeBeforePackage).toBe(130)
    expect(quote.packageDiscountApplied).toBe(false)
  })
})
