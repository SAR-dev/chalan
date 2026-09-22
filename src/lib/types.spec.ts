import { describe, expect, it } from "vitest"

describe("types module", () => {
  it("module can be imported without errors", async () => {
    const mod = await import("./types")
    expect(mod).toBeDefined()
  })

  it("re-exports balanceTxStatuses from schema (runtime value)", async () => {
    // balanceTxStatuses is re-exported as `export type { ... }` which is
    // type-only — it doesn't exist at runtime. Verify the schema module
    // has the value instead.
    const schema = await import("@/lib/db/schema")
    expect(schema.balanceTxStatuses).toBeDefined()
    expect(Array.isArray(schema.balanceTxStatuses)).toBe(true)
  })

  it("re-exports balanceTxTypes from schema (runtime value)", async () => {
    const schema = await import("@/lib/db/schema")
    expect(schema.balanceTxTypes).toBeDefined()
    expect(Array.isArray(schema.balanceTxTypes)).toBe(true)
  })
})
