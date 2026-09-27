import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the P2.5 cron invariants: the upload sweep must actually delete (not
// ship in dry-run), the monolith must schedule the jobs, and the pg_cron init
// script must mount from the right path.

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

describe("cron configuration (ROADMAP P2.5)", () => {
  it("cluster cron runs the upload sweep without ?dryRun=1", () => {
    const raw = read("docker", "compose.cluster.yml")
    expect(raw).toContain("/api/cron/cleanup-uploads")
    expect(raw).not.toContain("cleanup-uploads?dryRun=1")
  })

  it("monolith compose schedules the cleanup jobs", () => {
    const raw = read("docker", "compose.monolith.yml")
    expect(raw).toMatch(/^\s{2}cron:/m)
    for (const job of [
      "drain-email-outbox",
      "cleanup-sessions",
      "cleanup-audit-logs",
      "cleanup-email-logs",
      "cleanup-uploads",
    ]) {
      expect(raw).toContain(`/api/cron/${job}`)
    }
  })

  it("postgres compose mounts the pg_cron init script from scripts/", () => {
    const raw = read("docker", "compose.postgres.yml")
    const line = raw
      .split("\n")
      .find(
        (l) =>
          l.includes("setup-pg-cron.sql") &&
          l.includes("/docker-entrypoint-initdb.d/"),
      )
    // Relative to docker/, the repo-root scripts dir is ../scripts (the old
    // ./scripts pointed at docker/scripts, which does not exist).
    expect(line?.trim().startsWith("- ../scripts/setup-pg-cron.sql")).toBe(true)
  })
})
