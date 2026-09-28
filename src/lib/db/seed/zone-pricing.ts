import { db } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { log } from "./helpers"

const PRICING_MATRIX = [
  // From Dhaka Metro
  {
    fromZoneId: "DZ-100001E",
    toZoneId: "DZ-100001E",
    baseRate: 60,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100001E",
    toZoneId: "DZ-100002E",
    baseRate: 80,
    extraRatePerKg: 12,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100001E",
    toZoneId: "DZ-100003E",
    baseRate: 100,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },

  // From Divisional Cities
  {
    fromZoneId: "DZ-100002E",
    toZoneId: "DZ-100001E",
    baseRate: 80,
    extraRatePerKg: 12,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100002E",
    toZoneId: "DZ-100002E",
    baseRate: 70,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100002E",
    toZoneId: "DZ-100003E",
    baseRate: 110,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },

  // From Remote Areas
  {
    fromZoneId: "DZ-100003E",
    toZoneId: "DZ-100001E",
    baseRate: 100,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100003E",
    toZoneId: "DZ-100002E",
    baseRate: 110,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "DZ-100003E",
    toZoneId: "DZ-100003E",
    baseRate: 90,
    extraRatePerKg: 12,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
]

export async function seedZonePricing() {
  log("Seeding zone pricing matrix…")

  const existing = await db.select().from(zonePricing).limit(1)
  if (existing.length > 0) {
    log("  zone pricing already exists, skipping")
    return
  }

  // Cancellation fee charged (instead of the delivery fee) when an order on
  // the pair is returned to the merchant. Uniform in the seed; admins tune it
  // per city-pair from the platform settings page.
  const CANCELLATION_FEE = 20

  await db.insert(zonePricing).values(
    PRICING_MATRIX.map((row) => ({
      ...row,
      cancellationFee: CANCELLATION_FEE,
    })),
  )
  log(`  created ${PRICING_MATRIX.length} zone pricing rows`)
}
