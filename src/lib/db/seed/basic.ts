// Basic seed — the "fresh demo" dataset used by the daily midnight reset when
// NEXT_DEVELOPMENT_MODE is on (see src/lib/demo-reset.ts) and by
// `pnpm db:seed:basic`.
//
// Cleans the database and populates the basic entities a demo needs: base
// platform config, warehouses, delivery zones/cities and zone pricing, and the
// seeded accounts for every role (super admin, warehouse admin, merchant,
// rider).
//
// SMTP mail configs are NOT wiped: `cleanDatabase` never truncates
// `mail_config`, so the SMTP settings the admin configured (used by the daily
// reset emails) survive every reseed.
//
// Unlike the standalone entrypoints (index.ts / index-full.ts) this does NOT
// close the shared pool — the daily reset runs inside the long-lived server
// process. Closing the pool there would kill the app's DB connection.

import { cleanDatabase } from "./clean"
import { seedDeliveryCities } from "./delivery-cities"
import { seedDeliveryZones } from "./delivery-zones"
import { seedMerchants } from "./merchants"
import { seedPackages } from "./packages"
import { seedPlatformConfig } from "./platform-config"
import { seedRiders } from "./riders"
import { assertSeedAllowedInDev } from "./seed-content/credentials"
import { seedUsers } from "./users"
import { seedWarehouses } from "./warehouses"
import { seedZonePricing } from "./zone-pricing"

export async function seedBasicDatabase(): Promise<void> {
  assertSeedAllowedInDev()
  await cleanDatabase(["mail_config"])

  await seedWarehouses()
  await seedDeliveryZones()
  await seedDeliveryCities()
  await seedZonePricing()
  await seedPlatformConfig()
  await seedRiders()
  await seedMerchants()
  await seedPackages()
  await seedUsers()
}
