/**
 * Main seed orchestrator. Calls all seed functions in FK-safe order.
 * Only seeds base entities (warehouses, platform config, admin users).
 * Merchants, riders, pickup locations, and announcements are seeded by e2e/seed.ts.
 */

import "dotenv/config"
import { siteConfig } from "@/config/site"
import { pool } from "@/lib/db"
import { cleanDatabase } from "./clean"
import { seedDeliveryCities } from "./delivery-cities"
import { seedDeliveryZones } from "./delivery-zones"
import { log } from "./helpers"
import { seedPlatformConfig } from "./platform-config"
import { assertSeedAllowedInDev } from "./seed-content/credentials"
import { seedUsers } from "./users"
import { seedWarehouses } from "./warehouses"
import { seedZoneDeliveryTime } from "./zone-delivery-time"
import { seedZonePricing } from "./zone-pricing"

async function main() {
  console.log(`=== ${siteConfig.name} seed starting ===\n`)

  try {
    assertSeedAllowedInDev()
    await cleanDatabase()

    await seedWarehouses()
    await seedDeliveryZones()
    await seedDeliveryCities()
    await seedZonePricing()
    await seedZoneDeliveryTime()
    await seedPlatformConfig()
    await seedUsers()

    log(
      "Skipping merchants, riders, pickup locations, announcements, orders, payout requests",
    )

    console.log("\nSeed complete ✓")
  } catch (err) {
    console.error("\n[seed] ERROR:", err)
    process.exit(1)
  } finally {
    if (pool) await pool.end()
  }
}

main()
