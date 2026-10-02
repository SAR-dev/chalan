import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { BUSINESS_TIMEZONE } from "@/lib/timezone"
import * as schema from "./schema.postgres"

// Pin the session timezone to the business zone. Containers
// default to UTC, so `now()`, `date(...)` and any implicit day math would
// otherwise be six hours off. Explicit `AT TIME ZONE` (see `time-sql.ts`)
// stays authoritative regardless, but this keeps ad-hoc SQL consistent too.
const SESSION_TIMEZONE = `-c timezone=${BUSINESS_TIMEZONE}`

// A pool per process. `max` is the *per-process* ceiling, so the effective
// connection count is `max × instances` — keep it modest for serverless, where
// many short-lived instances each open their own pool and would otherwise
// exhaust Postgres. A long-lived container (or a pooled serverless setup via
// DATABASE_URL pointing at PgBouncer/Supavisor) can afford more.
const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
)
const POOL_MAX = IS_SERVERLESS ? 5 : 20

// Server-side ceiling on a single statement. Without it a
// query that plans badly simply hangs its request — there was no
// `log_min_duration_statement`, no `statement_timeout`, and no signal of any
// kind, so a 30s query looked identical to a healthy slow one. 15s is far
// above anything this app legitimately issues; raise it deliberately if a
// real workload needs more, rather than discovering it as a hang.
const STATEMENT_TIMEOUT_MS = 15_000

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: POOL_MAX,
  idleTimeoutMillis: 10_000,
  statement_timeout: STATEMENT_TIMEOUT_MS,
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
      max: POOL_MAX,
      idleTimeoutMillis: 10_000,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      options: SESSION_TIMEZONE,
    })
  : pool

export const dbRead = drizzle(readPool, { schema })
