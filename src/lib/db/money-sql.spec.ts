import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { sumAbsMoney, sumMoney, sumMoneyFiltered } from "@/lib/db/money-sql"
import { balanceTransaction, order } from "@/lib/db/schema"

// ROADMAP P0.8 — the money columns are `numeric(14,2)`, and node-postgres
// returns numeric (and therefore `sum(numeric)`) as a *string*. These helpers
// exist so no call site is ever handed text while claiming a number; the tests
// pin the cast that makes the `sql<number>` type honest.

const dialect = new PgDialect()
const render = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialect.sqlToQuery(fragment)

describe("money-sql", () => {
  it("sumMoney aggregates exactly and casts only the result", () => {
    const { sql: text } = render(sumMoney(order.merchantEarnings))
    expect(text).toContain("coalesce(sum(")
    expect(text).toContain(")::float8")
    // The column is inlined as an identifier (not a bind param), and it is
    // never cast before the aggregate.
    expect(text).toContain('"merchantEarnings"')
    expect(text).not.toContain('"merchantEarnings"::')
  })

  it("sumMoneyFiltered keeps the FILTER clause inside the aggregate", () => {
    const { sql: text } = render(
      sumMoneyFiltered(order.productCost, sql`${order.status} = 'DELIVERED'`),
    )
    expect(text).toContain("filter (where")
    expect(text).toContain(")::float8")
  })

  it("sumAbsMoney aggregates the absolute value", () => {
    const { sql: text } = render(sumAbsMoney(balanceTransaction.amount))
    expect(text).toContain("sum(abs(")
    expect(text).toContain(")::float8")
  })

  it("coalesces an empty set to 0 rather than null", () => {
    const { sql: text } = render(sumMoney(order.deliveryFee))
    expect(text).toMatch(/coalesce\(sum\(.+\), 0\)/)
  })
})
