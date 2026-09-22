/**
 * lib/db/seed/clean.ts
 *
 * Truncates all tables in FK-safe order.
 */

import { pool } from "@/lib/db"
import { log } from "./helpers"

export async function cleanDatabase() {
  log("Cleaning existing data…")

  await pool.query(
    `TRUNCATE TABLE "order", "payout_request", "balance_transaction", "merchant_balance", "profile", "verification", "session", "account", "user", "pickup_location", "merchant", "rider", "warehouse", "audit_log", "email_log", "announcement", "zone_pricing", "delivery_city", "delivery_zone" CASCADE`,
  )

  log("Clean complete.\n")
}
