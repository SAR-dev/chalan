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
})
