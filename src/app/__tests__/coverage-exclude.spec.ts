import { readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import config from "../../../vitest.config"

/**
 * The coverage `exclude` globs, and the directories they are meant to keep out
 * of the denominator.
 *
 * Each pair is `[directory, expected glob]`. The point of listing the directory
 * alongside the glob is that a glob can look right and still match nothing —
 * `src/lib/db/schema*` is a sibling-only pattern, so it excluded 0 of the 12
 * files in `src/lib/db/schema.postgres/`. Nobody noticed for as long as the
 * coverage provider happened not to attribute functions in those files; when
 * `@vitest/coverage-v8` 5 started attributing them, `src/lib/**` function
 * coverage fell from 88.78% to 80% against an 85% floor and the only visible
 * symptom was a red gate.
 *
 * So this asserts the *match*, not the spelling: the directory must be non-empty
 * (otherwise the assertion is vacuous) and every file in it must be covered by
 * one of the configured excludes.
 */
const EXCLUDED_DIRS = ["src/lib/db/schema.postgres", "src/lib/db/seed"] as const

/**
 * Minimal matcher for the glob shapes this config actually uses: `**` (any
 * depth), `*` (within one segment), `{a,b}` alternatives, and a literal path.
 *
 * Written out rather than pulled from a glob library so the test has no
 * dependency whose own glob dialect could disagree with the coverage
 * provider's — the question being asked is "does this pattern name this file",
 * and both answers have to come from the same rule.
 */
function toRegExp(pattern: string): RegExp {
  const segments = pattern.split("/")
  let source = "^"
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1
    if (segment === "**") {
      // `a/**` must also match `a` itself, and must cross `/`.
      source += last ? "(?:/.*)?$" : "(?:/.*)?/"
      continue
    }
    if (i > 0) source += "/"
    if (segment === "*") {
      source += "[^/]*"
      continue
    }
    const alternatives = segment.match(/^\{(.+)\}$/)
    if (alternatives) {
      source += `(?:${alternatives[1]
        .split(",")
        .map((a) => a.trim())
        .join("|")})`
      continue
    }
    source += segment.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`${source}$`)
}

/** Every `.ts`/`.tsx` file under `dir`, as repo-relative posix paths. */
function filesUnder(dir: string): string[] {
  const root = join(process.cwd(), dir)
  const out: string[] = []
  for (const entry of readdirSync(root, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue
    // Relative to the repo root, not to `dir` — a path built from `dir` plus
    // the parent's *last* segment silently duplicates the directory name
    // (`src/lib/db/db/index.ts`), and a doubled prefix can still match a
    // `dir/**` glob, so the assertion would pass for the wrong reason.
    out.push(
      relative(process.cwd(), join(entry.parentPath, entry.name)).replace(
        /\\/g,
        "/",
      ),
    )
  }
  return out.sort()
}

const excludes = (config as { test?: { coverage?: { exclude?: string[] } } })
  .test?.coverage?.exclude

describe("coverage exclude globs", () => {
  it("declares an exclude list", () => {
    expect(Array.isArray(excludes)).toBe(true)
    expect(excludes?.length).toBeGreaterThan(0)
  })

  it.each(EXCLUDED_DIRS)("actually excludes every file in %s", (dir) => {
    const files = filesUnder(dir)

    // Non-empty on purpose: an empty directory would make the match assertion
    // below pass without proving anything.
    expect(files.length).toBeGreaterThan(0)

    const patterns = (excludes ?? []).map(toRegExp)
    const leaked = files.filter((f) => !patterns.some((re) => re.test(f)))
    expect(
      leaked,
      `${leaked.length} file(s) under ${dir} are not matched by any coverage ` +
        `exclude glob, so they count towards the denominator`,
    ).toEqual([])
  })

  it("does not exclude the schema barrel's own spec", () => {
    // `src/lib/db/schema.spec.ts` tests the barrel's exports and must stay in
    // the report — the sibling `schema.ts` entry excludes the module, not its
    // test, and `src/**/*.spec.{ts,tsx}` is what actually keeps specs counted.
    const files = filesUnder("src/lib/db")
    const patterns = (excludes ?? []).map(toRegExp)
    expect(patterns.some((re) => re.test("src/lib/db/schema.ts"))).toBe(true)
    expect(patterns.some((re) => re.test("src/lib/db/schema.spec.ts"))).toBe(
      false,
    )
    expect(files).toContain("src/lib/db/schema.ts")
  })
})
