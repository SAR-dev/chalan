import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the cron invariants: the upload sweep must actually delete (not
// ship in dry-run), the monolith must schedule the jobs, and the pg_cron init
// script must mount from the right path.

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

/** Every cron route in the tree, discovered rather than hand-listed. */
function cronRoutes(): string[] {
  return readdirSync(join(process.cwd(), "src", "app", "api", "cron"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** The method the route actually exports. */
function routeMethod(route: string): "GET" | "POST" {
  const src = read("src", "app", "api", "cron", route, "route.ts")
  if (/^export const GET\b/m.test(src)) return "GET"
  if (/^export const POST\b/m.test(src)) return "POST"
  throw new Error(`cron route ${route} exports neither GET nor POST`)
}

/** The crontab line that invokes `route` in `raw`, if any. */
function crontabLine(raw: string, route: string): string | undefined {
  return raw
    .split("\n")
    .find((l) => l.includes("wget") && l.includes(`/api/cron/${route}`))
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

// Docker is what production actually runs (.github/workflows/deploy.yml), so a
// cron route that nobody schedules there is a job that simply never executes —
// which is how `stale-orders`, the only alerting job in the app, shipped with
// No production schedule at all.
describe("every cron route runs in production (ROADMAP R0.5)", () => {
  const routes = cronRoutes()

  it("finds the routes it is meant to guard", () => {
    expect(routes.length).toBeGreaterThanOrEqual(6)
    expect(routes).toContain("stale-orders")
  })

  for (const file of [
    "docker/compose.cluster.yml",
    "docker/compose.monolith.yml",
  ]) {
    const name = file.split("/").pop()
    it(`${name} schedules every cron route`, () => {
      const raw = read(...file.split("/"))
      for (const route of routes) {
        expect(
          crontabLine(raw, route),
          `${file} never invokes /api/cron/${route} — a new cron route with no ` +
            "production schedule is a job that never runs",
        ).toBeTruthy()
      }
    })

    // wget defaults to GET. The POST-only routes need --post-data (else the
    // server answers 405), and adding it to a GET-only route breaks that one
    // instead — either way the job silently stops working.
    it(`${name} calls each route with the method it exports`, () => {
      const raw = read(...file.split("/"))
      for (const route of routes) {
        const line = crontabLine(raw, route)
        if (!line) continue // asserted as a failure above
        const exported = routeMethod(route)
        const sent = line.includes("--post-data") ? "POST" : "GET"
        expect(
          sent,
          `${file}: /api/cron/${route} exports ${exported} but the crontab ` +
            `sends ${sent} — the job would answer 405 and never do its work`,
        ).toBe(exported)
      }
    })
  }
})
