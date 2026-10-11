#!/usr/bin/env node

/**
 * The single versioning command: bumps `package.json` and mirrors the new value
 * into `public/sw.js`.
 *
 * Usage:
 *   pnpm bump-sw              # patch  (0.1.0 -> 0.1.1)
 *   pnpm bump-sw minor        # minor  (0.1.0 -> 0.2.0)
 *   pnpm bump-sw major        # major  (0.1.0 -> 1.0.0)
 *
 * Why one command writes two files: `package.json` is the source of truth for
 * the version shown on the Account Settings page, and `public/sw.js` needs the
 * same string baked into its cache names so a deploy prunes the previous
 * generation. Bumping them independently is how they drift, and a stale cache
 * name is the kind of bug that only shows up on a user's phone.
 *
 * This only edits files — it does not commit or tag, so the change lands in the
 * same commit as whatever else the release contains.
 */

const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const pkgPath = path.join(root, "package.json")
const swPath = path.join(root, "public", "sw.js")

const LEVELS = {
  major: "major",
  minor: "minor",
  patch: "patch",
  prerelease: "prerelease",
}

function fail(message) {
  console.error(`bump-sw: ${message}`)
  process.exit(1)
}

/** Bumps a semver string without pulling in a dependency. */
function bump(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version)
  if (!match) {
    return null
  }
  const [, major, minor, patch, pre] = match

  // A prerelease outranks the level argument: 1.2.0-rc.1 + patch -> 1.2.0, so
  // promoting a release candidate to final does not need a different command.
  if (pre) {
    return `${major}.${minor}.${patch}`
  }

  switch (LEVELS[level]) {
    case "major":
      return `${Number(major) + 1}.0.0`
    case "minor":
      return `${major}.${Number(minor) + 1}.0`
    case "prerelease":
      return `${major}.${minor}.${Number(patch) + 1}-rc.1`
    default:
      return `${major}.${minor}.${Number(patch) + 1}`
  }
}

const level = process.argv[2] ?? "patch"
if (!(level in LEVELS)) {
  fail(
    `unknown level "${level}" — use one of ${Object.keys(LEVELS).join(", ")}`,
  )
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
const current = pkg.version
if (typeof current !== "string") {
  fail("package.json has no version")
}

const next = bump(current, level)
if (!next) {
  fail(`could not parse "${current}" as semver`)
}

// Keep the existing indentation of package.json so the diff stays to one line.
const indent = /^[\s\S]*?\n(\s+)"/.exec(fs.readFileSync(pkgPath, "utf8"))
pkg.version = next
fs.writeFileSync(
  pkgPath,
  `${JSON.stringify(pkg, null, indent ? indent[1] : 2)}\n`,
)

// Mirror into the service worker. The regex is anchored on the declaration and
// its value so it cannot rewrite one of the cache names that interpolates it.
const sw = fs.readFileSync(swPath, "utf8")
const swMatch = /const VERSION = "([^"]*)"/.exec(sw)
if (!swMatch) {
  fail('could not find `const VERSION = "..."` in public/sw.js')
}
const swUpdated = sw.replace(swMatch[0], `const VERSION = "${next}"`)
if (swUpdated === sw && swMatch[1] !== next) {
  fail("refusing to write: sw.js already held a value this run did not change")
}
fs.writeFileSync(swPath, swUpdated, "utf8")

console.log(`Version bumped: ${current} → ${next}`)
console.log(`  package.json  ${next}`)
console.log(
  `  public/sw.js  ${next}  (caches: chalan-shell-${next}, chalan-static-${next})`,
)
console.log(
  `\nReview the diff, then commit — this script does not commit for you.`,
)
