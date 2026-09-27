import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { order } from "@/lib/db/schema"
import { businessDate } from "./time-sql"

describe("businessDate", () => {
  it("renders an explicit Dhaka conversion cast to text", () => {
    const query = new PgDialect().sqlToQuery(businessDate(order.createdAt))
    // Explicit zone, not the session timezone (ROADMAP P1.3).
    expect(query.sql).toContain("AT TIME ZONE 'Asia/Dhaka'")
    // Text so node-postgres does not parse it into a JS Date.
    expect(query.sql).toContain("::text")
    expect(query.sql).toContain('"order"."createdAt"')
    // The zone is inlined from a constant, so nothing is parameterized.
    expect(query.params).toEqual([])
  })
})
