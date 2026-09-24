import { describe, expect, it } from "vitest"
import { diffEntity } from "./audit-diff"

describe("diffEntity", () => {
  it("returns null when nothing changed", () => {
    const before = { status: "PENDING", baseRate: 50 }
    const after = { status: "PENDING", baseRate: 50 }
    expect(diffEntity(before, after, ["status", "baseRate"])).toBeNull()
  })

  it("returns only the changed fields with from/to values", () => {
    const before = { status: "PENDING", baseRate: 50, maxWeightKg: 3 }
    const after = { status: "ACTIVE", baseRate: 60, maxWeightKg: 3 }
    expect(
      diffEntity(before, after, ["status", "baseRate", "maxWeightKg"]),
    ).toEqual({
      status: { from: "PENDING", to: "ACTIVE" },
      baseRate: { from: 50, to: 60 },
    })
  })

  it("treats null, undefined, and empty string as equivalent", () => {
    expect(
      diffEntity(
        { a: null, b: undefined, c: "" },
        { a: "", b: null, c: null },
        ["a", "b", "c"],
      ),
    ).toBeNull()
    expect(diffEntity({ a: null }, { a: "value" }, ["a"])).toEqual({
      a: { from: null, to: "value" },
    })
  })

  it("normalizes undefined output values to null", () => {
    expect(diffEntity({ a: undefined }, { a: "set" }, ["a"])).toEqual({
      a: { from: null, to: "set" },
    })
  })

  it("treats missing records as empty", () => {
    expect(diffEntity(null, undefined, ["a"])).toBeNull()
    expect(diffEntity(null, { a: 1 }, ["a"])).toEqual({
      a: { from: null, to: 1 },
    })
    expect(diffEntity({ a: 1 }, undefined, ["a"])).toEqual({
      a: { from: 1, to: null },
    })
  })

  it("compares arrays and objects by value", () => {
    expect(
      diffEntity(
        { refs: ["/a.png", "/b.png"] },
        { refs: ["/a.png", "/b.png"] },
        ["refs"],
      ),
    ).toBeNull()
    expect(
      diffEntity({ refs: ["/a.png"] }, { refs: ["/a.png", "/b.png"] }, [
        "refs",
      ]),
    ).toEqual({ refs: { from: ["/a.png"], to: ["/a.png", "/b.png"] } })
  })

  it("ignores fields outside the requested list", () => {
    expect(
      diffEntity({ status: "A", other: 1 }, { status: "B", other: 2 }, [
        "status",
      ]),
    ).toEqual({ status: { from: "A", to: "B" } })
  })
})
