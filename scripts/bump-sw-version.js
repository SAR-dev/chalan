#!/usr/bin/env node

/**
 * Bumps the service worker VERSION in public/sw.js.
 *
 * Usage: pnpm bump-sw
 *
 * Reads the current VERSION (e.g. "v2"), increments the numeric part ("v3"),
 * and writes it back. Run this before deploys that change static assets so
 * the activate handler prunes stale caches automatically.
 */

const fs = require("node:fs")
const path = require("node:path")

const swPath = path.resolve(__dirname, "../public/sw.js")
const content = fs.readFileSync(swPath, "utf8")

const match = content.match(/const VERSION = "(v(\d+))"/)
if (!match) {
  console.error("Could not find VERSION in public/sw.js")
  process.exit(1)
}

const current = match[1]
const num = Number(match[2])
const next = `v${num + 1}`

const updated = content.replace(
  `const VERSION = "${current}"`,
  `const VERSION = "${next}"`,
)

fs.writeFileSync(swPath, updated, "utf8")
console.log(`Service worker VERSION bumped: ${current} → ${next}`)
