import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema.postgres"

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10_000,
})

export const db = drizzle(pool, { schema })

// Read replica — set DATABASE_URL_READ_ONLY to offload GET queries to a replica.
// Falls back to the primary pool when no replica URL is configured, making it
// safe to use in development without any additional setup.
const readUrl = process.env.DATABASE_URL_READ_ONLY
export const readPool = readUrl ? new Pool({ connectionString: readUrl }) : pool

export const dbRead = drizzle(readPool, { schema })
