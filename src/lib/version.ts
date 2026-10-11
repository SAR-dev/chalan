import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The build's identity, for display on the Account Settings page.
 *
 * `package.json` is the single source of truth for the version. `public/sw.js`
 * mirrors the same string into its cache names (see `scripts/bump-sw-version.js`),
 * so a version shown here is also the version the service worker caches under.
 *
 * Server-only: it touches `node:fs`. Client components take an `AppVersion`
 * through props (type-only import) rather than importing this module, which is
 * what keeps `node:fs` out of the browser bundle.
 */
export interface AppVersion {
  /** `package.json` version, e.g. `"0.1.0"`. */
  version: string
  /** Short commit SHA the build came from, when the host exposes one. */
  commit: string | null
}

/** Shown when a build gives us nothing usable, rather than rendering blank. */
export const UNKNOWN_VERSION = "0.0.0-unknown"

function readPkgVersion(): string {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    )
    const version = (parsed as { version?: unknown } | null)?.version
    if (typeof version === "string" && version.length > 0) return version
  } catch {
    // A missing or malformed package.json must never take a settings page down.
    // In the Docker image it is copied in, and `next start` runs from the repo
    // root, so this branch means a genuinely odd deployment — not a normal one.
  }
  return UNKNOWN_VERSION
}

/** The commit SHA each supported host injects, most specific first. */
function readCommit(): string | null {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    null
  return sha ? sha.slice(0, 7) : null
}

let cached: AppVersion | null = null

/**
 * Read once per server process — the file cannot change under a running server,
 * and this is called on every Settings render.
 */
export function getAppVersion(): AppVersion {
  cached ??= { version: readPkgVersion(), commit: readCommit() }
  return cached
}
