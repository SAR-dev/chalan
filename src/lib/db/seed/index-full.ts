/**
 * Full seed orchestrator — runs everything including orders, payouts, and balances.
 * Call via: pnpm db:seed:full
 */

import "dotenv/config"
import { siteConfig } from "@/config/site"
import { pool } from "@/lib/db"
import { seedAnnouncements } from "./announcements"
import { seedBalances } from "./balances"
import { cleanDatabase } from "./clean"
import { seedDeliveryCities } from "./delivery-cities"
import { seedDeliveryZones } from "./delivery-zones"
import { seedMerchants } from "./merchants"
import { seedOrders } from "./orders"
import { seedPayoutRequests } from "./payouts"
import { seedPickupLocations } from "./pickup-locations"
import { seedPlatformConfig } from "./platform-config"
import { seedRiders } from "./riders"
import { seedUsers } from "./users"
import { seedWarehouses } from "./warehouses"
import { seedZonePricing } from "./zone-pricing"

async function main() {
  console.log(`=== ${siteConfig.name} full seed starting ===\n`)

  try {
    await cleanDatabase()

    // Base entities (same as db:seed)
    await seedWarehouses()
    await seedDeliveryZones()
    await seedDeliveryCities()
    await seedZonePricing()
    await seedPlatformConfig()
    await seedRiders()
    await seedMerchants()
    await seedPickupLocations()
    await seedUsers()
    await seedAnnouncements()

    // Orders, payouts, and balances
    await seedOrders()
    await seedPayoutRequests()
    await seedBalances()

    console.log("\nFull seed complete ✓")
  } catch (err) {
    console.error("\n[seed] ERROR:", err)
    process.exit(1)
  } finally {
    if (pool) await pool.end()
  }
}

main()
