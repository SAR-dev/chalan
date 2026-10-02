import { readdirSync, readFileSync } from "node:fs"
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

/**
 * E2E serials are a documented invariant ("unique, no gaps or duplicates"), and
 * AGENTS.md had drifted to S65/104 while the suite was already at S71/129 —
 * with a duplicate S68 nobody noticed (ROADMAP R1.4). Structural facts are
 * asserted rather than exact totals: file and test counts churn with every new
 * spec, but a duplicate serial or a gap is always a mistake.
 */
describe("E2E suite invariants (ROADMAP R1.4)", () => {
  function serials() {
    const dir = join(process.cwd(), "e2e", "specs")
    return readdirSync(dir)
      .filter((file) => file.endsWith(".spec.ts"))
      .flatMap((file) => {
        const raw = readFileSync(join(dir, file), "utf-8")
        return [...raw.matchAll(/describe\("S(\d+)\.\s*([^"]*)"/g)].map(
          (m) => ({ id: Number(m[1]), name: m[2], file }),
        )
      })
  }

  it("assigns every scenario a unique serial", () => {
    const seen = new Map<number, string>()
    const dupes: string[] = []
    for (const { id, file, name } of serials()) {
      const where = `${file} ("${name}")`
      if (seen.has(id)) dupes.push(`S${id}: ${seen.get(id)} and ${where}`)
      seen.set(id, where)
    }
    expect(dupes, "scenario serials must be unique").toEqual([])
  })

  // Deliberately NOT a "no gaps" assertion. Removing a feature holes the
  // sequence — dropping the branding suites left S36 unused — and renumbering
  // every later serial across 32 files to close one hole would churn history
  // for no safety gain. What actually drifts is the summary AGENTS.md quotes,
  // which had gone stale (S65 / 104 tests) while the suite was already at
  // S71 / 129 with a duplicate nobody noticed.
  it("quotes suite numbers in AGENTS.md that match the tree", () => {
    const ids = serials().map((s) => s.id)
    expect(ids.length).toBeGreaterThan(0)

    const files = readdirSync(join(process.cwd(), "e2e", "specs")).filter((f) =>
      f.endsWith(".spec.ts"),
    )
    let testCount = 0
    for (const f of files) {
      const raw = readFileSync(join(process.cwd(), "e2e", "specs", f), "utf-8")
      testCount += [...raw.matchAll(/^\s*test\(/gm)].length
    }

    const expected = `S1-S${Math.max(...ids)} across ${files.length} files / ${testCount} tests`
    // Markdown wraps prose, so the phrase can straddle a newline — compare
    // whitespace-normalised text or every reflow would fail this.
    const normalize = (s: string) => s.replace(/\s+/g, " ")
    expect(
      normalize(read("AGENTS.md")),
      "AGENTS.md suite summary is stale — update it to: " + expected,
    ).toContain(normalize(expected))
  })

  it("documents coverage floors that match vitest.config.ts", () => {
    const config = read("vitest.config.ts")
    const agents = read("AGENTS.md")
    const floor = (key: string) =>
      Number(config.match(new RegExp(`\\b${key}:\\s*(\\d+)`))?.[1])
    const documented = `${floor("statements")} / ${floor("branches")} / ${floor("functions")} / ${floor("lines")}`
    expect(agents).toContain(`(${documented})`)
  })
})
