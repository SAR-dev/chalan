import { type SQL, type SQLChunk, sql } from "drizzle-orm"

// =============================================================================
// Money aggregates in raw SQL
//
// Every money column is stored as `numeric(14,2)`. PostgreSQL returns
// `numeric` — and therefore `sum(numeric)` — to node-postgres as a *string*, so
// a `sql<number>` fragment over such a column was quietly typed as a number
// while holding text at runtime ("750" + 50 === "75050"). These helpers keep the
// arithmetic exact inside PostgreSQL and cast only the *result* to float8, which
// is what the JS side actually wanted. Inputs are never cast, so no rounding
// happens before the aggregate.
// =============================================================================

/** `coalesce(sum(<money column>), 0)` as a JS number. */
export function sumMoney(column: SQLChunk): SQL<number> {
  return sql<number>`coalesce(sum(${column}), 0)::float8`
}

/** `sum(<money>)` restricted by a `FILTER (WHERE …)` clause, as a JS number. */
export function sumMoneyFiltered(
  column: SQLChunk,
  condition: SQLChunk,
): SQL<number> {
  return sql<number>`coalesce(sum(${column}) filter (where ${condition}), 0)::float8`
}

/** `sum(abs(<money column>))` — used for "pending exposure" style totals. */
export function sumAbsMoney(column: SQLChunk): SQL<number> {
  return sql<number>`coalesce(sum(abs(${column})), 0)::float8`
}
