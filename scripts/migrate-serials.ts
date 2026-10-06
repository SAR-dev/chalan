import { execSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Re-derives each spec's content from `HEAD` (the authoritative original) and
// re-applies the `S<n>` → `<fileNN><index>` serial migration.
//
// Written because the first pass dropped the trailing dot: the pattern
// `S(\d+)\.` consumes the dot, so the replacement has to put it back. Rebuilding
// from git rather than patching what is on disk keeps this idempotent — the
// original is re-read every run, so running it twice cannot double-transform.
//
// File renames (01…37 contiguous) are assumed already applied; this handles
// content only. The slug — filename minus its `NN-` prefix — is stable across
// that rename, which is what lets an old tracked path be matched to its new one.

const dir = join(process.cwd(), "e2e", "specs")
const slug = (name: string) => name.replace(/^\d{2}-/, "")

const tracked = execSync("git ls-files e2e/specs", { encoding: "utf-8" })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)

const oldBySlug = new Map<string, { path: string; serials: number[] }>()
for (const p of tracked) {
  const base = p.replace(/\\/g, "/").split("/").pop()!
  const raw = execSync(`git show HEAD:${p}`, {
    encoding: "utf-8",
    maxBuffer: 1 << 24,
  })
  const serials = [...raw.matchAll(/describe\("S(\d+)\./g)].map((m) =>
    Number(m[1]),
  )
  oldBySlug.set(slug(base), { path: p, serials })
}

let written = 0
for (const f of readdirSync(dir)
  .filter((x) => x.endsWith(".spec.ts"))
  .sort()) {
  const prefix = f.slice(0, 2)
  if (!/^\d{2}$/.test(prefix)) throw new Error(`bad prefix: ${f}`)

  const old = oldBySlug.get(slug(f))
  if (!old) throw new Error(`no original for ${f}`)
  if (old.serials.length === 0)
    throw new Error(`no describes in original of ${f}`)

  const original = execSync(`git show HEAD:${old.path}`, {
    encoding: "utf-8",
    maxBuffer: 1 << 24,
  })

  // File prefix + 1-based index inside the file.
  const map = new Map<number, string>()
  old.serials.forEach((o, i) =>
    map.set(o, `${prefix}${String(i + 1).padStart(2, "0")}`),
  )

  // The dot is re-emitted here — that was the bug in the first pass.
  const next = original.replace(/\bS(\d+)\./g, (m, d) => {
    const hit = map.get(Number(d))
    return hit ? `${hit}.` : m
  })

  const onDisk = readFileSync(join(dir, f), "utf-8")
  if (next !== onDisk) {
    writeFileSync(join(dir, f), next, "utf-8")
    written++
  }
}

console.log(`rewrote ${written} file(s) from HEAD`)
