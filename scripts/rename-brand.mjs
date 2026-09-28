#!/usr/bin/env node
// Renames the product brand (name + domain) across the repo.
//
// Usage:
//   node scripts/rename-brand.mjs                         # Chalan / chalan.sarn.top
//   node scripts/rename-brand.mjs --name "Foo Bar" --domain "foo.example.com"
//
// The current brand is auto-detected from src/config/site.json, then replaced
// everywhere it appears: site config, service-worker cache prefix, the deploy
// workflow's NEXT_PUBLIC_SITE_URL default, the 2FA otpauth fixture, and this
// repo's conventions doc. Domains are matched for the bare host and the
// "test." / "parcel." subdomains the repo used as preview/deploy defaults.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const args = process.argv.slice(2)
function argValue(flag, fallback) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const newName = argValue("--name", "Chalan").trim()
const newDomain = argValue("--domain", "chalan.sarn.top")
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "")
if (!newName || !newDomain || newDomain.includes(" ")) {
  console.error("Usage: node scripts/rename-brand.mjs [--name NAME] [--domain DOMAIN]")
  process.exit(1)
}

const siteJsonPath = join(root, "src/config/site.json")
const siteJson = JSON.parse(readFileSync(siteJsonPath, "utf8"))
const oldName = siteJson.name
const oldUrl = siteJson.siteUrl
const oldHost = new URL(oldUrl).hostname
// Base domain without subdomain (e.g. "jhor.express" from "test.jhor.express").
const oldRootHost = oldHost.split(".").slice(-2).join(".")

if (oldName === newName && oldHost === newDomain) {
  console.log(`Already "${newName}" on ${newDomain} — nothing to change.`)
  process.exit(0)
}

const oldKebab = oldName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
const newKebab = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
// Compact form with no separators — the service worker uses `jhorexpress-shell`,
// not `jhor-express-shell`.
const oldCompact = oldName.toLowerCase().replace(/[^a-z0-9]/g, "")
const newCompact = newName.toLowerCase().replace(/[^a-z0-9]/g, "")

const files = [
  "src/config/site.json",
  "public/sw.js",
  ".github/workflows/deploy.yml",
  "src/lib/two-factor.spec.ts",
  "CONTRIBUTING.md",
]

console.log(`Renaming "${oldName}" -> "${newName}", ${oldHost} -> ${newDomain}`)

let changed = 0
for (const rel of files) {
  const path = join(root, rel)
  const before = readFileSync(path, "utf8")
  let text = before

  // Domains: the exact host first, then the legacy "test." / "parcel."
  // preview/deploy subdomains (whose prefix the new brand deliberately drops),
  // and last the bare root domain so earlier matches aren't re-scanned.
  for (const ref of [
    oldHost,
    `test.${oldRootHost}`,
    `parcel.${oldRootHost}`,
    oldRootHost,
  ]) {
    text = text.split(ref).join(newDomain)
  }
  // Brand name, URL-encoded form (2FA otpauth URI), and the prefix forms used
  // by the service-worker cache names (`jhor-express`, `jhorexpress`).
  text = text.split(oldName).join(newName)
  text = text.split(encodeURIComponent(oldName)).join(encodeURIComponent(newName))
  text = text.split(oldKebab).join(newKebab)
  text = text.split(oldCompact).join(newCompact)

  if (text !== before) {
    writeFileSync(path, text, "utf8")
    changed++
    console.log(`  updated ${rel}`)
  }
}

console.log(changed > 0 ? `Done — ${changed} file(s) updated.` : "No files needed changes.")