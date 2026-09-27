import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { BUSINESS_TIMEZONE } from "@/lib/timezone"
import * as schema from "./schema.postgres"

// Pin the session timezone to the business zone (ROADMAP P1.3). Containers
// default to UTC, so `now()`, `date(...)` and any implicit day math would
// otherwise be six hours off. Explicit `AT TIME ZONE` (see `time-sql.ts`)
// stays authoritative regardless, but this keeps ad-hoc SQL consistent too.
const SESSION_TIMEZONE = `-c timezone=${BUSINESS_TIMEZONE}`

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10_000,
  options: SESSION_TIMEZONE,
})

export const db = drizzle(pool, { schema })

// Read replica — set DATABASE_URL_READ_ONLY to offload GET queries to a replica.
// Falls back to the primary pool when no replica URL is configured, making it
// safe to use in development without any additional setup.
const readUrl = process.env.DATABASE_URL_READ_ONLY
export const readPool = readUrl
  ? new Pool({
      connectionString: readUrl,
      options: SESSION_TIMEZONE,
    })
  : pool

export const dbRead = drizzle(readPool, { schema })
