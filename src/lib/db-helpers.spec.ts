import { describe, expect, it } from "vitest"
import { enumValue, enumValues } from "./db-helpers"

const ROLES = ["SUPER_ADMIN", "MERCHANT", "RIDER"] as const

describe("enumValue", () => {
  it("returns the value when it is a member", () => {
    expect(enumValue("MERCHANT", ROLES)).toBe("MERCHANT")
  })

  it("returns null for a non-member", () => {
    // The guard that stops `?role=BOGUS` reaching eq().
    expect(enumValue("BOGUS", ROLES)).toBeNull()
    expect(enumValue("merchant", ROLES)).toBeNull() // case-sensitive
  })

  it("returns null for empty / missing values", () => {
    expect(enumValue("", ROLES)).toBeNull()
    expect(enumValue(null, ROLES)).toBeNull()
    expect(enumValue(undefined, ROLES)).toBeNull()
  })

  it("returns null for a partial match", () => {
    expect(enumValue("MERCH", ROLES)).toBeNull()
  })
})

describe("enumValues", () => {
  it("passes an array through unchanged", () => {
    const input = ["MERCHANT", "RIDER"]
    expect(enumValues<(typeof ROLES)[number]>(input)).toEqual(input)
  })

  it("returns an empty array for an empty input", () => {
    expect(enumValues<string>([])).toEqual([])
  })
})
