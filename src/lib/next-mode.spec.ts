import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SEED_PASSWORD } from "@/lib/db/seed/seed-content/credentials"
import { isNextModeEnabled, seededSignIns } from "@/lib/next-mode"

const MANAGED = ["NEXT_MODE", "NEXT_PUBLIC_ENV"] as const

describe("next mode (NEXT_MODE)", () => {
  beforeEach(() => {
    for (const key of MANAGED) delete process.env[key]
  })

  afterEach(() => {
    for (const key of MANAGED) delete process.env[key]
  })

  it("is off when NEXT_MODE is unset or falsy", () => {
    for (const value of [undefined, "", "false", "0", "no", "off"]) {
      if (value === undefined) delete process.env.NEXT_MODE
      else process.env.NEXT_MODE = value
      expect(isNextModeEnabled()).toBe(false)
    }
  })

  it("is on for the truthy spellings we accept", () => {
    for (const value of ["true", "TRUE", " true ", "1"]) {
      process.env.NEXT_MODE = value
      expect(isNextModeEnabled()).toBe(true)
    }
  })

  it("stays off in production even when the flag is set", () => {
    process.env.NEXT_MODE = "true"
    process.env.NEXT_PUBLIC_ENV = "production"
    expect(isNextModeEnabled()).toBe(false)
    expect(seededSignIns()).toEqual([])
  })

  it("offers nothing while disabled", () => {
    expect(seededSignIns()).toEqual([])
  })

  it("offers one account per role when enabled", () => {
    process.env.NEXT_MODE = "true"
    const accounts = seededSignIns()

    expect(accounts.map((a) => a.label)).toEqual([
      "Super admin",
      "Warehouse admin",
      "Merchant",
      "Rider",
    ])
    expect(accounts.map((a) => a.email)).toEqual([
      "admin1@email.com",
      "warehouse.admin1@email.com",
      "merchant1@email.com",
      "rider1@email.com",
    ])
    // Every seeded account shares one password, so each entry must carry it.
    for (const account of accounts) {
      expect(account.password).toBe(SEED_PASSWORD)
    }
  })
})
