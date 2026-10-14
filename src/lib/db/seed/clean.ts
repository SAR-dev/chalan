/**
 * lib/db/seed/clean.ts
 *
 * Truncates all tables in FK-safe order.
 */

import { pool } from "@/lib/db"
import { log } from "./helpers"

/** Every table a seed wipes. Deliberately does NOT include `mail_config` —
 *  SMTP configs are the admin's runtime state, not seed data, and are
 *  preserved across reseeds (see seedBasicDatabase). */
export const SEED_CLEAN_TABLES = [
  "order_status_history",
  "order",
  "payout_request",
  "balance_transaction",
  "merchant_balance",
  // FK user, so it must be truncated *before* it. Absent until read state moved
  // onto the rows: without this a reseed preserved every notification and its
  // `readAt`, so the next e2e run started with a merchant who had already read
  // their whole inbox and left no badge to assert against. Read state is
  // per-reader and meaningless across a reseed, for the same reason orders are.
  "notification",
  "profile",
  "verification",
  "session",
  "account",
  "user",
  "pickup_location",
  // Package tables FK merchant, so they must be truncated before it.
  "package_purchase_request",
  "merchant_package",
  "pricing_package_tier",
  "pricing_package",
  "merchant",
  "rider",
  "warehouse",
  "audit_log",
  "email_log",
  "email_outbox",
  "announcement",
  "zone_pricing",
  "zone_delivery_time",
  "delivery_city",
  "delivery_zone",
  "support_ticket",
  "platform_config",
  "label_template",
] as const

/**
 * Wipes database rows so a seed can start from a clean slate. Tables listed in
 * `preserve` are left untouched (and their dependents in the truncate set stay
 * truncated, since none of them FK to the preserved tables).
 */
export async function cleanDatabase(
  preserve: readonly string[] = [],
): Promise<void> {
  log("Cleaning existing data…")

  const skip = new Set(preserve)
  const tables = SEED_CLEAN_TABLES.filter((t) => !skip.has(t))
  // Quote every name: "order" is a reserved word and needs to be `"order"`.
  const quoted = tables.map((t) => `"${t}"`).join(", ")
  await pool.query(`TRUNCATE TABLE ${quoted} CASCADE`)

  log("Clean complete.\n")
}
