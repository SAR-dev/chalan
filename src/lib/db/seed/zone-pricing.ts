import { db } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { log } from "./helpers"

const PRICING_MATRIX = [
  // From Dhaka Metro
  {
    fromZoneId: "seed_zone_dhaka",
    toZoneId: "seed_zone_dhaka",
    baseRate: 60,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_dhaka",
    toZoneId: "seed_zone_divisional",
    baseRate: 80,
    extraRatePerKg: 12,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_dhaka",
    toZoneId: "seed_zone_remote",
    baseRate: 100,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },

  // From Divisional Cities
  {
    fromZoneId: "seed_zone_divisional",
    toZoneId: "seed_zone_dhaka",
    baseRate: 80,
    extraRatePerKg: 12,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_divisional",
    toZoneId: "seed_zone_divisional",
    baseRate: 70,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_divisional",
    toZoneId: "seed_zone_remote",
    baseRate: 110,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },

  // From Remote Areas
  {
    fromZoneId: "seed_zone_remote",
    toZoneId: "seed_zone_dhaka",
    baseRate: 100,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_remote",
    toZoneId: "seed_zone_divisional",
    baseRate: 110,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
  },
  {
    fromZoneId: "seed_zone_remote",
    toZoneId: "seed_zone_remote",
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

  await db.insert(zonePricing).values(PRICING_MATRIX)
  log(`  created ${PRICING_MATRIX.length} zone pricing rows`)
}
