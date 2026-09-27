import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `credentials.ts` reads the environment at module scope, so each case needs a
// fresh module instance with its own env.
async function loadSeedCredentials(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "")
    else vi.stubEnv(key, value)
  }
  if (env.SEED_PASSWORD === undefined) {
    vi.stubEnv("SEED_PASSWORD", "")
  }
  return await import("@/lib/db/seed/seed-content/credentials")
}

describe("seed password policy (ROADMAP P0.7)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("keeps the documented dev default when SEED_PASSWORD is unset", async () => {
    const mod = await loadSeedCredentials({ NODE_ENV: "development" })
    expect(mod.SEED_PASSWORD).toBe("12qwaszx")
    expect(mod.USING_DEFAULT_SEED_PASSWORD).toBe(true)
    expect(() => mod.assertSeedPasswordAllowed()).not.toThrow()
  })

  it("uses SEED_PASSWORD when provided", async () => {
    const mod = await loadSeedCredentials({ SEED_PASSWORD: "s3cret-dev-pass" })
    expect(mod.SEED_PASSWORD).toBe("s3cret-dev-pass")
    expect(mod.USING_DEFAULT_SEED_PASSWORD).toBe(false)
  })

  it("refuses to seed a production database with the default password", async () => {
    const mod = await loadSeedCredentials({ NODE_ENV: "production" })
    expect(() => mod.assertSeedPasswordAllowed()).toThrow(/SEED_PASSWORD/)
  })

  it("allows a production seed once SEED_PASSWORD is set", async () => {
    const mod = await loadSeedCredentials({
      NODE_ENV: "production",
      SEED_PASSWORD: "a-very-strong-unique-password",
    })
    expect(() => mod.assertSeedPasswordAllowed()).not.toThrow()
  })
})
