import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the deploy-safety invariants from ROADMAP P2.1. The workflow can't be
// executed in unit tests, so this asserts the properties that made the old one
// unsafe: it must gate on CI, fail fast, and never swallow a migration failure.

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy.yml"),
  "utf-8",
)

describe("deploy workflow (ROADMAP P2.1)", () => {
  it("only runs after the CI workflow succeeds on main", () => {
    expect(raw).toMatch(/workflow_run:/)
    expect(raw).toMatch(/workflows:\s*\["CI"\]/)
    expect(raw).toMatch(/branches:\s*\[main\]/)
    expect(raw).toMatch(/conclusion == 'success'/)
  })

  it("fails fast and never swallows a migration failure", () => {
    expect(raw).toContain("set -euo pipefail")
    // The old `docker compose run --rm migrate || docker compose run --rm
    // migrate-dashboard` hid a failed migration behind a successful fallback.
    expect(raw).not.toMatch(/\|\|\s*docker compose/)
    expect(raw).toContain("docker compose run --rm migrate")
  })

  it("takes a backup before applying migrations", () => {
    const dumpAt = raw.indexOf("pg_dump")
    const migrateAt = raw.indexOf("docker compose run --rm migrate")
    expect(dumpAt).toBeGreaterThan(-1)
    expect(migrateAt).toBeGreaterThan(-1)
    expect(dumpAt).toBeLessThan(migrateAt)
  })

  it("deploys the exact commit CI validated", () => {
    expect(raw).toContain("github.event.workflow_run.head_sha")
  })
})
