// Standalone entrypoint for the basic seed: `pnpm db:seed:basic`.
//
// Runs the same dataset as the scheduled demo reset (seedBasicDatabase) but in
// its own process, so it owns the pool and closes it when done.

import "dotenv/config"
import { siteConfig } from "@/config/site"
import { pool } from "@/lib/db"
import { seedBasicDatabase } from "./basic"
import { log } from "./helpers"

async function main() {
  console.log(`=== ${siteConfig.name} basic seed starting ===\n`)
  try {
    await seedBasicDatabase()
    log("Basic seed complete.")
  } catch (err) {
    console.error("\n[seed] ERROR:", err)
    process.exitCode = 1
  } finally {
    if (pool) await pool.end()
  }
}

main()
