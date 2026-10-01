import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_EMAIL_LOG_RETENTION_DAYS,
} from "@/lib/env"

// Guards the P2.6 docs/env reconciliation against regressions.

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

describe("docs / env drift (ROADMAP P2.6)", () => {
  it("ships a BETTER_AUTH_SECRET placeholder that passes the 32-char boot check", () => {
    const raw = read(".env.example")
    const line = raw
      .split("\n")
      .find((l) => l.startsWith("BETTER_AUTH_SECRET="))
    expect(
      line,
      "BETTER_AUTH_SECRET must be present in .env.example",
    ).toBeTruthy()
    const value = line!.slice("BETTER_AUTH_SECRET=".length).trim()
    expect(value.length).toBeGreaterThanOrEqual(32)
  })

  it("README quickstart applies migrations and uses the real uploads dir", () => {
    const raw = read("README.md")
    expect(raw).toContain("pnpm db:migrate")
    expect(raw).toContain("./.uploads")
  })

  it("DEPLOYMENT monolith ports match compose", () => {
    const docs = read("docs", "DEPLOYMENT.md")
    for (const port of ["25432", "25433", "25434"]) {
      expect(docs).toContain(port)
    }
  })
})

/**
 * Retention defaults are restated outside TypeScript in two places that cannot
 * import the constants: the pg_cron SQL (runs inside Postgres) and the env
 * reference table. If either disagrees with `src/lib/env.ts`, cleanup jobs
 * silently delete on a different schedule than the routes do — which is how the
 * comments drifted to 90 / 30 while the code applied 30 / 10 (ROADMAP R0.7).
 */
describe("retention defaults (ROADMAP R0.7)", () => {
  /** The `coalesce(..., N)` fallback guarding `app.<setting>` in pg_cron SQL. */
  function pgCronFallback(setting: string): number | null {
    const raw = read("scripts", "setup-pg-cron.sql")
    const match = raw.match(
      new RegExp(
        `coalesce\\(\\s*nullif\\(current_setting\\('app\\.${setting}'` +
          `.*?,\\s*(\\d+)\\s*\\)`,
        "s",
      ),
    )
    return match ? Number.parseInt(match[1], 10) : null
  }

  it("pg_cron's audit-log fallback matches the constant the route applies", () => {
    expect(pgCronFallback("audit_log_retention_days")).toBe(
      DEFAULT_AUDIT_LOG_RETENTION_DAYS,
    )
  })

  it("pg_cron's email-log fallback matches the constant the route applies", () => {
    expect(pgCronFallback("email_log_retention_days")).toBe(
      DEFAULT_EMAIL_LOG_RETENTION_DAYS,
    )
  })

  it("docs/ENV.md documents the same defaults the routes apply", () => {
    const docs = read("docs", "ENV.md")
    for (const [key, expected] of [
      ["AUDIT_LOG_RETENTION_DAYS", DEFAULT_AUDIT_LOG_RETENTION_DAYS],
      ["EMAIL_LOG_RETENTION_DAYS", DEFAULT_EMAIL_LOG_RETENTION_DAYS],
    ] as const) {
      const row = docs.match(
        new RegExp(`\`\\s*${key}\`\\s*\\|[^|]*\\|\\s*\`(\\d+)\``),
      )
      expect(row, `${key} row missing from docs/ENV.md`).toBeTruthy()
      expect(Number.parseInt(row![1], 10), `${key} in docs/ENV.md`).toBe(
        expected,
      )
    }
  })

  // The routes must import the constant rather than restate a literal — a
  // literal is what allowed the two to diverge in the first place.
  it("both cron routes take their default from src/lib/env.ts", () => {
    expect(
      read("src", "app", "api", "cron", "cleanup-audit-logs", "route.ts"),
    ).toContain('from "@/lib/env"')
    expect(
      read("src", "app", "api", "cron", "cleanup-email-logs", "route.ts"),
    ).toContain('from "@/lib/env"')
  })
})
