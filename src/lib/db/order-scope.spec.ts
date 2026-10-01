import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { buildWarehouseOrderScope } from "./order-scope"

// The scope is a SQL predicate, so assert on the SQL it renders. This is the
// single source of truth for warehouse order visibility — a change here
// silently widens or narrows what a warehouse admin can see.
const dialect = new PgDialect()

function render(warehouseId: string) {
  const predicate = buildWarehouseOrderScope(warehouseId)
  if (!predicate) throw new Error("expected a predicate")
  return dialect.sqlToQuery(predicate)
}

describe("buildWarehouseOrderScope", () => {
  it("scopes to the caller's warehouse", () => {
    const { sql, params } = render("wh_1")
    expect(sql).toContain('"order"."warehouseId" =')
    expect(params).toContain("wh_1")
  })

  it("includes APPROVED orders with no pickup rider (assignable)", () => {
    const { sql, params } = render("wh_1")
    expect(sql).toContain('"order"."pickupRiderId" is null')
    expect(params).toContain("APPROVED")
  })

  it("ORs the two branches together", () => {
    const { sql } = render("wh_1")
    // Two alternatives → one OR.
    expect(sql.match(/ or /g)).toHaveLength(1)
  })

  // A third clause — `warehouseId is null and status = 'PICKED_UP'` for
  // "incoming intake candidates" — used to sit here. It could never match
  // (`order.warehouseId` is NOT NULL, FK `ON DELETE no action`, and nothing in
  // the codebase nulls it), and the intake queue is driven by status rather
  // than a null warehouse. Keeping it only forced a bitmap-OR over an
  // index-friendly predicate (ROADMAP R0.12).
  it("does not reintroduce an unreachable warehouse-null clause", () => {
    const { sql } = render("wh_1")
    expect(sql).not.toContain('"order"."warehouseId" is null')
  })

  it("binds the warehouse id exactly once", () => {
    const { params } = render("wh_42")
    expect(params.filter((p) => p === "wh_42")).toHaveLength(1)
  })
})
