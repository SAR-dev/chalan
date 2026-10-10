import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_EMAIL_LOG_RETENTION_DAYS,
} from "@/lib/env"

// Guards the docs/env reconciliation against regressions.

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

/**
 * Markdown wraps prose, so a quoted phrase can straddle a newline — compare
 * whitespace-normalised text or every reflow would fail the assertion.
 */
const normalize = (s: string) => s.replace(/\s+/g, " ")

function e2eSpecFiles(): string[] {
  return readdirSync(join(process.cwd(), "e2e", "specs")).filter((f) =>
    f.endsWith(".spec.ts"),
  )
}

/** `test(` at line start — one per e2e case, matching how AGENTS.md counts. */
function e2eTestCount(): number {
  let count = 0
  for (const file of e2eSpecFiles()) {
    count += [
      ...readFileSync(
        join(process.cwd(), "e2e", "specs", file),
        "utf-8",
      ).matchAll(/^\s*test\(/gm),
    ].length
  }
  return count
}

describe("docs / env drift", () => {
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
 * Comments drifted to 90 / 30 while the code applied 30 / 10.
 */
describe("retention defaults", () => {
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
 * Scenario serials are `<fileNN><index>` — `0101` is the first scenario in
 * `01-core-flows.spec.ts`, `2902` the second in `29-sign-out.spec.ts`.
 *
 * They were a single global sequence (`S1…S81`), which hid two defects: numbers
 * drifted out of file order (a log read S1, S6, S8, S55, S21, …) and gaps piled
 * up as scenarios were deleted, leaving nobody sure whether S33 was retired or
 * simply lost. Scoped ids make both structural impossibilities — adding or
 * removing a scenario renumbers exactly one file, and the log runs in serial
 * order because the files do.
 */
describe("E2E suite invariants", () => {
  function serials() {
    const dir = join(process.cwd(), "e2e", "specs")
    return readdirSync(dir)
      .filter((file) => file.endsWith(".spec.ts"))
      .sort()
      .flatMap((file) => {
        const raw = readFileSync(join(dir, file), "utf-8")
        return [...raw.matchAll(/describe\("(\d{4})\.\s*([^"]*)"/g)].map(
          (m) => ({ id: m[1], name: m[2], file }),
        )
      })
  }

  it("assigns every scenario a unique serial", () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const { id, file, name } of serials()) {
      const where = `${file} ("${name}")`
      if (seen.has(id)) dupes.push(`${id}: ${seen.get(id)} and ${where}`)
      seen.set(id, where)
    }
    expect(dupes, "scenario serials must be unique").toEqual([])
  })

  // The structural half of the scheme: a file's serials must be its own
  // two-digit prefix followed by 01, 02, … in file order. That is what makes a
  // log readable, and it means nobody has to grep every file for "the current
  // max" before adding one. It also fails on the two things the old global
  // sequence could not see: a serial out of order inside its file, and a gap.
  it("numbers each file's scenarios from 01, in order", () => {
    const byFile = new Map<string, string[]>()
    for (const { id, file } of serials()) {
      byFile.set(file, [...(byFile.get(file) ?? []), id])
    }
    expect(byFile.size).toBeGreaterThan(0)

    for (const [file, ids] of byFile) {
      expect(/^\d{2}-/.test(file), `${file} needs a two-digit prefix`).toBe(
        true,
      )
      expect(ids, `${file} serials are out of order, or gapped`).toEqual(
        ids.map(
          (_, i) => `${file.slice(0, 2)}${String(i + 1).padStart(2, "0")}`,
        ),
      )
    }
  })

  it("quotes suite numbers in AGENTS.md that match the tree", () => {
    const list = serials()
    expect(list.length).toBeGreaterThan(0)

    const expected = `${list.length} scenarios across ${e2eSpecFiles().length} files / ${e2eTestCount()} tests`
    expect(
      normalize(read("AGENTS.md")),
      "AGENTS.md suite summary is stale — update it to: " + expected,
    ).toContain(normalize(expected))
  })

  // The coverage floors live in vitest.config.ts; the doc that quotes them is
  // checked here so it cannot drift silently.
  it("documents coverage floors that match vitest.config.ts", () => {
    const config = read("vitest.config.ts")
    const floor = (key: string) =>
      Number(config.match(new RegExp(`\\b${key}:\\s*(\\d+)`))?.[1])
    const documented = `${floor("statements")} / ${floor("branches")} / ${floor("functions")} / ${floor("lines")}`
    expect(read("AGENTS.md")).toContain(`(${documented})`)
  })
})
