import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Biome now covers the root configs too. Both ways of getting
// it wrong fail confusingly rather than obviously, so both are pinned.

const raw = readFileSync(join(process.cwd(), "biome.json"), "utf-8")
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf-8"),
) as { "lint-staged": Record<string, string> }

function includes(): string[] {
  return (JSON.parse(raw) as { files: { includes: string[] } }).files.includes
}

describe("biome config (ROADMAP R5.7)", () => {
  it("is strict JSON, because Biome rejects comments in biome.json", () => {
    // A `//` note makes Biome report `at biome.json:N:M parse — Expected an
    // array, an object, or a literal` *and then run with defaults*, checking
    // every file in the tree (7013, `.next/**` included) instead of the ~845
    // this repo owns. JSONC goes in `biome.jsonc`, not here — so no comments
    // in this file, however tempting the explanation.
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it("checks the root configs the rest of `src` was already checked against", () => {
    expect(includes()).toContain("*.{ts,mts,js,mjs,cjs,json}")
  })

  it("excludes the file Next regenerates on every build", () => {
    // `next build`/`next dev` rewrite `next-env.d.ts` with semicolons, and its
    // own header says "should not be edited". Without this exclusion Biome
    // strips them again, so `pnpm ci:check` fails the moment you build.
    expect(includes()).toContain("!next-env.d.ts")
  })

  it("names only files biome can actually match in lint-staged", () => {
    const globs = Object.keys(pkg["lint-staged"])
    expect(globs).toHaveLength(1)
    const glob = globs[0]
    // `md,mdx`: Biome has no markdown parser, so the entry was a silent no-op.
    // `css`: not in `files.includes`, so `--no-errors-on-unmatched` swallowed
    // it too. Both made the glob promise more than the command delivered.
    expect(glob).not.toMatch(/md/)
    expect(glob).not.toMatch(/css/)
    expect(pkg["lint-staged"][glob]).toBe(
      "biome check --write --no-errors-on-unmatched",
    )
  })
})
