import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf-8")

describe("CI workflow", () => {
  it("keeps Playwright out of CI (local gate only)", () => {
    // The e2e job was removed on purpose: the suite is a pre-merge/local gate
    // (`pnpm build` + `pnpm test:e2e`), not a CI one. If you re-add the job,
    // restore the migration → build → Playwright ordering it enforced.
    expect(raw).not.toMatch(/^\s{2}e2e:/m)
    expect(raw).not.toContain("pnpm test:e2e")
    expect(raw).not.toContain("playwright install")
    // ...but the suite itself must stay runnable.
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
