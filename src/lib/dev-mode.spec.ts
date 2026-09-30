import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SEED_PASSWORD } from "@/lib/db/seed/seed-content/credentials"
import { isDevModeEnabled, seededDevSignIns } from "@/lib/dev-mode"

const MANAGED = ["NEXT_PUBLIC_ENV"] as const

describe("dev mode (NEXT_PUBLIC_ENV)", () => {
  beforeEach(() => {
    for (const key of MANAGED) delete process.env[key]
  })

  afterEach(() => {
    for (const key of MANAGED) delete process.env[key]
  })

  it("is off for a production deployment", () => {
    process.env.NEXT_PUBLIC_ENV = "production"
    expect(isDevModeEnabled()).toBe(false)
    expect(seededDevSignIns()).toEqual([])
  })

  it("stays off when the var is unset or not the development scope", () => {
    // Unset falls back to `development` in validateEnv, but an undeclared
    // environment must never publish credentials on its own.
    for (const value of [undefined, "", "production", "Development", "dev"]) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_ENV
      else process.env.NEXT_PUBLIC_ENV = value
      expect(isDevModeEnabled()).toBe(false)
    }
  })

  it("is on for a development deployment", () => {
    process.env.NEXT_PUBLIC_ENV = "development"
    expect(isDevModeEnabled()).toBe(true)
  })

  it("offers nothing while disabled", () => {
    expect(seededDevSignIns()).toEqual([])
  })

  it("offers one account per role when enabled", () => {
    process.env.NEXT_PUBLIC_ENV = "development"
    const accounts = seededDevSignIns()

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
