import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the deploy-safety invariants. The workflow can't be
// executed in unit tests, so this asserts the properties that made the old one
// unsafe: it must gate on CI, fail fast, and never swallow a migration failure.

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy.yml"),
  "utf-8",
)

describe("deploy workflow", () => {
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

  it("sets up Buildx before a build that exports a cache", () => {
    // The default `docker` driver cannot export a cache, so `cache-to: type=gha`
    // aborts the build before the image is pushed. That took production down for
    // days; this pins the step that makes the cache legal, and its ordering.
    const setupAt = raw.indexOf("docker/setup-buildx-action")
    const buildAt = raw.indexOf("docker/build-push-action")
    expect(setupAt).toBeGreaterThan(-1)
    expect(buildAt).toBeGreaterThan(-1)
    expect(setupAt).toBeLessThan(buildAt)
  })

  it("pushes a lowercase image name", () => {
    // Docker rejects an uppercase repository and `github.repository` is
    // `SAR-dev/chalan`, so a tag built from it fails at push time with
    // "repository name must be lowercase". The name is computed once, lowercased,
    // and both the tags and the VPS's APP_IMAGE read that one output.
    const normaliseAt = raw.indexOf("Compute the lowercase image name")
    const buildAt = raw.indexOf("docker/build-push-action")
    expect(normaliseAt).toBeGreaterThan(-1)
    expect(normaliseAt).toBeLessThan(buildAt)
    expect(raw).toContain("${GITHUB_REPOSITORY,,}")
    // The raw, uppercase-carrying source must not reach a tag again.
    expect(raw).not.toMatch(/tags:.*github\.repository/)
    expect(raw).not.toContain("env.IMAGE_NAME")
  })
})
