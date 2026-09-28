import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf-8")

/** The `name:` job block, from its key to the next top-level job key. */
function jobBlock(name: string): string {
  const start = raw.search(new RegExp(`^\\s{2}${name}:`, "m"))
  if (start === -1) return ""
  const rest = raw.slice(start + 1)
  const next = rest.search(/^\s{2}[a-zA-Z0-9_-]+:/m)
  return next === -1 ? raw.slice(start) : rest.slice(0, next)
}

describe("CI workflow", () => {
  it("runs e2e after migrating and building", () => {
    // The e2e job is a CI gate. It must keep the ordering it depends on:
    // migrate the DB, build the app, install browsers, then run the suite.
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

  it("runs the coverage gate", () => {
    expect(raw).toMatch(/^\s{2}coverage:/m)
    expect(raw).toContain("pnpm test:coverage")
  })

  it("runs the real-DB integration suite", () => {
    expect(raw).toMatch(/^\s{2}integration:/m)
    expect(raw).toContain("pnpm test:integration")
    expect(raw).toContain("INTEGRATION_DATABASE_URL")
  })
})
