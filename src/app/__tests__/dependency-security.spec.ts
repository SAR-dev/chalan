import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)
const workspace = readFileSync(
  join(process.cwd(), "pnpm-workspace.yaml"),
  "utf-8",
)
const contributing = readFileSync(
  join(process.cwd(), "CONTRIBUTING.md"),
  "utf-8",
)

/**
 * Advisories we knowingly ship, and the comment each one has to justify it.
 *
 * Hard-coded rather than derived so that *adding* an entry to
 * `auditConfig.ignoreGhsas` fails this spec until someone writes down why it is
 * safe. An ignore list that grows silently is how an audit gate stops meaning
 * anything.
 */
const ACCEPTED: Record<string, string> = {
  "GHSA-vfj7-8cjw-p6xm": "braces",
}

/** Every GHSA id listed under `auditConfig.ignoreGhsas`, with its line index. */
function ignoredAdvisories(): { id: string; line: number }[] {
  const lines = workspace.split("\n")
  const start = lines.findIndex((l) => /^\s*ignoreGhsas:\s*$/.test(l))
  if (start === -1) return []

  const found: { id: string; line: number }[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^\s*-\s*(GHSA-[a-z0-9-]+)\s*$/)
    // Stop at the first line that is not a list item or a comment — that is the
    // end of the block, whatever key comes next.
    if (!match && !/^\s*(#|-|$)/.test(lines[i])) break
    if (match) found.push({ id: match[1], line: i })
  }
  return found
}

describe("dependency security gate", () => {
  it("audits the whole tree, not just production", () => {
    // `pnpm audit --prod` reports 0 high on this tree, so switching to it would
    // hide every dev-side finding while the gate still looked green.
    expect(workflow).toContain("pnpm audit --audit-level=high")
    expect(workflow).not.toContain("pnpm audit --prod")
  })

  it("has an accepted-advisory list that is not empty by accident", () => {
    // Guards the parser above: if `ignoreGhsas` ever moves or is renamed, this
    // fails instead of silently reading as "no exceptions".
    expect(workspace).toMatch(/^\s*auditConfig:\s*$/m)
    expect(workspace).toMatch(/^\s*ignoreGhsas:\s*$/m)
  })

  it("justifies every ignored advisory in the manifest and in the docs", () => {
    const ignored = ignoredAdvisories()
    expect(ignored.length).toBeGreaterThan(0)

    const lines = workspace.split("\n")
    for (const { id, line } of ignored) {
      // The comment block directly above the entry must name the package, so
      // the reason is readable from pnpm-workspace.yaml alone.
      const above = lines.slice(Math.max(0, line - 8), line).join("\n")
      const packageName = ACCEPTED[id]
      expect(packageName, `${id} is ignored but not a known exception`).toBe(
        packageName,
      )
      expect(above, `${id} has no explanatory comment above it`).toContain(
        packageName,
      )
      expect(above).toMatch(/latest published release|no version to move to/i)
    }
  })

  it("documents the gate and the exception in CONTRIBUTING.md", () => {
    expect(contributing).toContain("## Dependency security")
    expect(contributing).toContain("pnpm audit --audit-level=high")
    for (const id of Object.keys(ACCEPTED)) {
      expect(contributing).toContain(id)
    }
    // The trap that makes the exception look removable when it is not: the
    // dependent is also a build input, so deleting it breaks `pnpm build`.
    expect(contributing).toContain("shadcn/tailwind.css")
  })
})
