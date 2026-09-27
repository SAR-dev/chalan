import { describe, expect, it } from "vitest"
import {
  isForeignKeyViolation,
  isSerializationFailure,
  isUniqueViolation,
  violatedConstraint,
} from "./db-errors"

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error(`pg: ${code}`), {
    code,
    constraint,
  })
}

describe("isUniqueViolation", () => {
  it("matches 23505 and nothing else", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true)
    expect(isUniqueViolation(pgError("23503"))).toBe(false)
    expect(isUniqueViolation(new Error("plain"))).toBe(false)
  })

  it("tolerates non-errors", () => {
    for (const value of [null, undefined, "23505", 42, {}]) {
      expect(isUniqueViolation(value)).toBe(false)
    }
  })
})

describe("isForeignKeyViolation", () => {
  it("matches 23503", () => {
    expect(isForeignKeyViolation(pgError("23503"))).toBe(true)
    expect(isForeignKeyViolation(pgError("23505"))).toBe(false)
  })
})

describe("isSerializationFailure", () => {
  it("matches both the serialization and deadlock states", () => {
    expect(isSerializationFailure(pgError("40001"))).toBe(true)
    expect(isSerializationFailure(pgError("40P01"))).toBe(true)
    expect(isSerializationFailure(pgError("23505"))).toBe(false)
  })
})

describe("violatedConstraint", () => {
  it("returns the index name the driver reported", () => {
    expect(violatedConstraint(pgError("23505", "rider_email_uniq"))).toBe(
      "rider_email_uniq",
    )
  })

  it("returns null when absent or not a string", () => {
    expect(violatedConstraint(pgError("23505"))).toBeNull()
    expect(violatedConstraint({ constraint: 7 })).toBeNull()
    expect(violatedConstraint(null)).toBeNull()
    expect(violatedConstraint("nope")).toBeNull()
  })
})
