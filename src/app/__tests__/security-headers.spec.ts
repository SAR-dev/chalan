import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Static response headers live in `next.config.mjs`; the per-request CSP lives
// In `src/proxy.ts`. Nothing asserted these two before, so
// dropping either would have been invisible.

const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf-8")
const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf-8")

describe("static security headers (ROADMAP R5.9)", () => {
  it("stops announcing the framework", () => {
    // `X-Powered-By: Next.js` tells an attacker the framework and version
    // before they have probed for anything.
    expect(config).toMatch(/\bpoweredByHeader:\s*false\b/)
  })

  it("sets HSTS, which nothing else in the stack did", () => {
    const match = config.match(
      /Strict-Transport-Security["',\s]*value:\s*"([^"]+)"/,
    )
    expect(match, "Strict-Transport-Security header is missing").not.toBeNull()

    const maxAge = match![1].match(/max-age=(\d+)/)
    expect(maxAge, "HSTS needs an explicit max-age").not.toBeNull()
    // Browsers ignore HSTS over plain HTTP, so local dev is unaffected; a
    // year is the shortest max-age worth shipping.
    expect(Number(maxAge![1])).toBeGreaterThanOrEqual(31_536_000)
    expect(match![1]).toContain("includeSubDomains")
  })

  it("keeps the nonce'd CSP out of the static config", () => {
    // A static header cannot carry a per-request nonce, so declaring one here
    // would ship a policy that blocks Next's own hydration scripts. The note
    // in `next.config.mjs` records it; this asserts it stays true.
    expect(config).not.toMatch(/["']Content-Security-Policy["']/)
    expect(proxy).toContain("content-security-policy")
  })
})
