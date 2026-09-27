import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the P2.4 invariant: the Playwright suite must run in CI against a
// real Postgres, after the migrations and a production build.

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)

describe("CI workflow (ROADMAP P2.4)", () => {
  it("has an e2e job backed by a Postgres service", () => {
    expect(raw).toMatch(/^\s{2}e2e:/m)
    expect(raw).toMatch(/image:\s*postgres:/)
    expect(raw).toContain("DATABASE_URL")
  })

  it("migrates, builds, then runs Playwright", () => {
    expect(raw).toContain("pnpm db:migrate")
    expect(raw).toContain("pnpm build")
    expect(raw).toContain("pnpm exec playwright install")
    expect(raw).toContain("pnpm test:e2e")
  })

  it("runs the coverage gate (ROADMAP P3)", () => {
    expect(raw).toMatch(/^\s{2}coverage:/m)
    expect(raw).toContain("pnpm test:coverage")
  })

  it("runs the real-DB integration suite (ROADMAP P3)", () => {
    expect(raw).toMatch(/^\s{2}integration:/m)
    expect(raw).toContain("pnpm test:integration")
    expect(raw).toContain("INTEGRATION_DATABASE_URL")
  })
})
