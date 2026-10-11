// @vitest-environment node

import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `package.json` is the version source of truth and `public/sw.js` mirrors it
 * into its cache names. Nothing but `pnpm bump-sw` keeps the two aligned, and a
 * drift is invisible until a user is stuck on a stale cached shell — so the
 * sync is asserted here rather than trusted.
 *
 * The script resolves its paths from `__dirname`, so running it against a
 * sandbox is just a matter of laying out the same shape in a temp dir.
 */

const SCRIPT = join(process.cwd(), "scripts", "bump-sw-version.js")

const pkgVersion = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    version: string
  }
).version

const swVersion = /const VERSION = "([^"]*)"/.exec(
  readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"),
)?.[1]

function sandbox(from: string): string {
  const dir = mkdtempSync(join(tmpdir(), "bump-sw-"))
  mkdirSync(join(dir, "scripts"))
  mkdirSync(join(dir, "public"))
  copyFileSync(SCRIPT, join(dir, "scripts", "bump-sw-version.js"))
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "x", version: from }, null, 2)}\n`,
  )
  writeFileSync(
    join(dir, "public", "sw.js"),
    `const VERSION = "${from}"\nconst CACHE = \`shell-\${VERSION}\`\n`,
  )
  return dir
}

function run(dir: string, ...args: string[]): string {
  return execFileSync(
    process.execPath,
    [join(dir, "scripts", "bump-sw-version.js"), ...args],
    {
      encoding: "utf8",
    },
  )
}

function versionsIn(dir: string): { pkg: string; sw: string | undefined } {
  return {
    pkg: (
      JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        version: string
      }
    ).version,
    sw: /const VERSION = "([^"]*)"/.exec(
      readFileSync(join(dir, "public", "sw.js"), "utf8"),
    )?.[1],
  }
}

describe("versioning", () => {
  it("keeps the service worker in sync with package.json", () => {
    expect(swVersion).toBe(pkgVersion)
  })

  it("is reachable as `pnpm bump-sw`", () => {
    const scripts = (
      JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }
    ).scripts
    expect(scripts["bump-sw"]).toContain("bump-sw-version.js")
  })

  it.each([
    ["0.1.0", [], "0.1.1"],
    ["0.1.0", ["minor"], "0.2.0"],
    ["0.1.0", ["major"], "1.0.0"],
    ["1.2.9", [], "1.2.10"],
    ["0.1.0", ["prerelease"], "0.1.1-rc.1"],
    // A prerelease outranks the level, so promoting an rc to final needs no
    // special command.
    ["1.2.0-rc.1", [], "1.2.0"],
    ["1.2.0-rc.1", ["minor"], "1.2.0"],
  ])("bumps %s %s to %s", (from, args, expected) => {
    const dir = sandbox(from)
    run(dir, ...args)
    expect(versionsIn(dir)).toEqual({ pkg: expected, sw: expected })
  })

  it("leaves the rest of sw.js untouched", () => {
    const dir = sandbox("0.1.0")
    const before = readFileSync(join(dir, "public", "sw.js"), "utf8")
    run(dir)
    const after = readFileSync(join(dir, "public", "sw.js"), "utf8")

    // Only the declaration line may change. The cache names interpolate
    // VERSION, so rewriting one of those would create a second version source.
    expect(after.replace('const VERSION = "0.1.1"', "")).toBe(
      before.replace('const VERSION = "0.1.0"', ""),
    )
  })

  it("keeps package.json's original indentation", () => {
    const dir = sandbox("0.1.0")
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ name: "x", version: "0.1.0" }, null, 4)}\n`,
    )
    run(dir)
    expect(readFileSync(join(dir, "package.json"), "utf8")).toMatch(
      /^\{\n {4}"name"/,
    )
  })

  it("refuses an unknown level instead of guessing", () => {
    const dir = sandbox("0.1.0")
    expect(() => run(dir, "sideways")).toThrow()
    expect(versionsIn(dir).pkg).toBe("0.1.0")
  })
})
