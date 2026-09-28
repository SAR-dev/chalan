import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `credentials.ts` reads the environment at module scope, so each case needs a
// fresh module instance with its own env.
async function loadSeedCredentials(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  return await import("@/lib/db/seed/seed-content/credentials")
}

describe("seed password policy", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("always uses the documented development password", async () => {
    const mod = await loadSeedCredentials({ NODE_ENV: "development" })
    expect(mod.SEED_PASSWORD).toBe("12qwaszx")
  })

  it("ignores a stale SEED_PASSWORD left in the environment", async () => {
    const mod = await loadSeedCredentials({ SEED_PASSWORD: "s3cret-dev-pass" })
    expect(mod.SEED_PASSWORD).toBe("12qwaszx")
  })

  it("allows a development seed", async () => {
    const mod = await loadSeedCredentials({ NODE_ENV: "development" })
    expect(() => mod.assertSeedAllowedInDev()).not.toThrow()
  })

  it("refuses to seed a production database", async () => {
    const mod = await loadSeedCredentials({ NODE_ENV: "production" })
    expect(() => mod.assertSeedAllowedInDev()).toThrow(/production/i)
  })
})
