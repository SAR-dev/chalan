// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
// `getAppVersion` is deliberately not imported statically — every case reaches
// it through a fresh dynamic import, so the module-level cache starts empty.
import { UNKNOWN_VERSION } from "./version"

/**
 * The module caches on first call, so each case re-imports it with the env it
 * needs rather than trying to poke at the cache.
 */
async function readVersionWithEnv() {
  vi.resetModules()
  const mod = await import("./version")
  return mod.getAppVersion()
}

const realVersion = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    version: string
  }
).version

const COMMIT_VARS = [
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "CF_PAGES_COMMIT_SHA",
] as const

afterEach(() => {
  for (const key of COMMIT_VARS) delete process.env[key]
  vi.resetModules()
})

describe("getAppVersion", () => {
  it("reads the version from package.json", async () => {
    expect((await readVersionWithEnv()).version).toBe(realVersion)
  })

  it("reports no commit when the host exposes none", async () => {
    expect((await readVersionWithEnv()).commit).toBeNull()
  })

  it.each(COMMIT_VARS)("shortens the SHA from %s", async (key) => {
    process.env[key] = "0123456789abcdef0123456789abcdef01234567"
    expect((await readVersionWithEnv()).commit).toBe("0123456")
  })

  it("prefers Vercel's SHA over the GitHub one", async () => {
    process.env.GITHUB_SHA = "1111111111111111111111111111111111111111"
    process.env.VERCEL_GIT_COMMIT_SHA =
      "2222222222222222222222222222222222222222"
    expect((await readVersionWithEnv()).commit).toBe("2222222")
  })

  it("reads the file once and reuses the result", async () => {
    const mod = await import("./version")
    expect(mod.getAppVersion()).toBe(mod.getAppVersion())
  })

  it("never throws when package.json is unreadable", async () => {
    // A version display is not worth a 500 on the settings page. The fallback
    // is asserted by driving the module with a cwd that has no package.json.
    vi.resetModules()
    const original = process.cwd
    process.cwd = () => join(original(), "src/components/ui")
    try {
      const mod = await import("./version")
      expect(mod.getAppVersion().version).toBe(UNKNOWN_VERSION)
    } finally {
      process.cwd = original
    }
  })
})
