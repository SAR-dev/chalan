import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf-8")

/**
 * The workflow with comment markers stripped.
 *
 * A job may be deliberately disabled by commenting it out (the `e2e` job is, to
 * save CI minutes). Stripping the markers means the guard below still validates
 * that job's shape and step ordering, so it cannot be silently broken while
 * disabled — or re-enabled in the wrong order.
 */
const workflow = raw
  .split("\n")
  .map((line) => line.replace(/^\s*#\s?/, ""))
  .join("\n")

/** The `name:` job block, from its key to the next top-level job key. */
function jobBlock(name: string): string {
  const start = workflow.search(new RegExp(`^\\s{2}${name}:`, "m"))
  if (start === -1) return ""
  const rest = workflow.slice(start + 1)
  const next = rest.search(/^\s{2}[a-zA-Z0-9_-]+:/m)
  return next === -1 ? workflow.slice(start) : rest.slice(0, next)
}

describe("CI workflow", () => {
  it("keeps the e2e job's migrate → build → install → test ordering", () => {
    // Whether the job is enabled or commented out, it must keep the ordering it
    // depends on: migrate the DB, build the app, install browsers, then run.
    const job = jobBlock("e2e")
    expect(job).not.toBe("")

    const order = [
      "pnpm db:migrate",
      "pnpm build",
      "playwright install",
      "pnpm test:e2e",
    ].map((step) => job.indexOf(step))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))

    // ...and the suite itself must stay runnable locally.
    expect(pkg).toContain('"test:e2e"')
  })

  it("documents why the e2e job is disabled", () => {
    // A disabled gate needs a written reason next to it, so it is a decision
    // rather than an accident.
    expect(raw).toContain("Disabled on purpose")
  })

  it("runs the coverage gate", () => {
    expect(workflow).toMatch(/^\s{2}coverage:/m)
    expect(workflow).toContain("pnpm test:coverage")
  })

  it("runs the quality gate as one job behind a single install", () => {
    // `pnpm ci:check` is typecheck && lint:check && format:check. Keeping it in
    // one job is deliberate: splitting it paid a full dependency install per
    // check to reach a ~1.5s Biome invocation.
    const job = jobBlock("quality")
    expect(job).not.toBe("")
    expect(job).toContain("pnpm ci:check")
    expect(
      job.match(/run: pnpm install --frozen-lockfile/g) ?? [],
    ).toHaveLength(1)
    // ...and the three jobs it replaced must not creep back in.
    expect(workflow).not.toMatch(/^\s{2}(typecheck|lint|format):/m)
    // The gate itself must stay runnable locally.
    expect(pkg).toContain('"ci:check"')
  })

  it("keeps the dependency install out of the security job", () => {
    // `pnpm audit` resolves the tree from pnpm-lock.yaml and the dependency
    // review diffs the lockfile — neither needs node_modules.
    expect(jobBlock("security")).not.toContain("run: pnpm install")
    expect(jobBlock("security")).toContain("pnpm audit")
  })

  it("runs the real-DB integration suite against its own service container", () => {
    expect(workflow).toMatch(/^\s{2}integration:/m)
    expect(workflow).toContain("pnpm test:integration")
    expect(workflow).toContain("INTEGRATION_DATABASE_URL")

    // Hermetic: the job must not point at a shared remote database.
    const job = jobBlock("integration")
    expect(job).toContain(
      "postgres://postgres:postgres@localhost:5432/delivery",
    )
    expect(job).not.toMatch(/neon\.tech|sslmode=require/)
  })

  it("boots the smoke step with every var validateEnv requires", () => {
    // `validateEnv()` runs from instrumentation on `pnpm start` and throws on the
    // first missing required var, so an incomplete env fails at boot with a wall
    // of "required but not set" lines instead of a curl timeout — and it does so
    // in the `build` job, which reads as a build failure rather than a config one.
    // The vars it needs are spread across the workflow-level and step-level env
    // blocks, so assert against the union `pnpm start` actually sees.
    const stepStart = workflow.indexOf("- name: Smoke test the built app")
    expect(stepStart).toBeGreaterThan(-1)
    const stepEnd = workflow.indexOf("\n        run:", stepStart)
    const stepEnv = workflow.slice(
      stepStart,
      stepEnd === -1 ? undefined : stepEnd,
    )

    const topEnv = workflow.slice(
      workflow.search(/^env:$/m),
      workflow.indexOf("\njobs:"),
    )

    const keysAt = (indent: number, text: string) =>
      [
        ...text.matchAll(new RegExp(`^ {${indent}}([A-Z][A-Z0-9_]*):`, "gm")),
      ].map((m) => m[1])

    // Unconditional requirements from `src/lib/env.ts` validateEnv, plus the
    // LOCAL_UPLOADS_DIR that STORAGE_PROVIDER=local pulls in. NEXT_PUBLIC_* come
    // from the workflow-level block, which is why they are absent from the step.
    // Adding a required var to env.ts means adding it here.
    expect(
      [...new Set([...keysAt(2, topEnv), ...keysAt(10, stepEnv)])].sort(),
    ).toEqual([
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
      "DATABASE_URL",
      "LOCAL_UPLOADS_DIR",
      "NEXT_PUBLIC_ENV",
      "NEXT_PUBLIC_SITE_URL",
      "STORAGE_PROVIDER",
    ])
  })
})
