import { type Column, type SQL, sql } from "drizzle-orm"
import { BUSINESS_TIMEZONE } from "@/lib/timezone"

/**
 * `date(column AT TIME ZONE 'Asia/Dhaka')` — the business-local day of a
 * `timestamptz` column (ROADMAP P1.3).
 *
 * Grouping on `date(created_at)` used the DB session timezone, which defaults
 * to UTC, so a Dhaka evening order landed in the next day's bucket. The
 * explicit `AT TIME ZONE` makes the bucket independent of the session setting.
 */
export function businessDate(column: Column | SQL): SQL<string> {
  // `::text` keeps the value a `YYYY-MM-DD` string: node-postgres otherwise
  // parses `date` into a JS Date and JSON serializes it as a full timestamp.
  return sql<string>`date(${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIMEZONE}'`)})::text`
}
