import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the skip-link target: the root layout renders a single
// "Skip to main content" link, so every page must expose a `<main>` carrying
// `id="main-content"` or the link would jump nowhere.

const ROOT = join(process.cwd(), "src", "app")

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Route groups still contain real pages/layouts.
      return tsxFiles(full)
    }
    return full.endsWith(".tsx") ? [full] : []
  })
}

const mains = tsxFiles(ROOT).flatMap((file) => {
  const source = readFileSync(file, "utf-8")
  return source.includes("<main")
    ? [{ file: file.replace(`${join(process.cwd(), "src")}\\`, ""), source }]
    : []
})

describe("skip-to-content target (ROADMAP P4.4)", () => {
  it("finds the page/shell <main> landmarks", () => {
    // Guards the guard: if this ever returns 0 the assertions below are vacuous.
    expect(mains.length).toBeGreaterThan(0)
  })

  it("renders exactly one skip link, from the root layout", () => {
    const root = readFileSync(join(ROOT, "layout.tsx"), "utf-8")
    expect(root).toContain("<SkipToContent />")

    const others = mains.filter((m) => !m.file.endsWith("layout.tsx"))
    for (const { file, source } of others) {
      expect(
        source,
        `${file} must not render a second skip link`,
      ).not.toContain("SkipToContent")
    }
  })

  it("gives every <main> the main-content id", () => {
    for (const { file, source } of mains) {
      const bare = source.match(/<main(?!\s+id="main-content")/g) ?? []
      expect(
        bare,
        `${file} has a <main> without id="main-content"`,
      ).toHaveLength(0)
    }
  })
})
