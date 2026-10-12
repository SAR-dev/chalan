import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `src/lib/order-event.ts` holds the order vocabulary — the event names, the
 * title copy, the href — and is imported by client components that render
 * notification rows. That only works because the module is a pure leaf.
 *
 * It was not, to begin with: the vocabulary lived in `order-events.ts`, next to
 * `emitOrderEvent`, which imports `@/lib/webhooks` and `@/lib/notifications` and
 * so reaches `@/lib/db`. A "use client" component importing it passed `tsc` and
 * every unit test, then failed the production build —
 *
 *     Turbopack build failed with 7 errors:
 *     Error: Module not found: Can't resolve 'dns'   (also fs, net, tls)
 *
 * Typecheck passes, tests pass, and only the bundler notices. Finding it cost a
 * full build, so the boundary is pinned here instead.
 */

const SRC = join(process.cwd(), "src")
const LIB = join(SRC, "lib")

/**
 * Module specifiers this file imports as *values*.
 *
 * Comments are stripped before scanning, and each statement is anchored to the
 * start of a line. A plain regex over raw source is wrong in two directions that
 * both showed up while writing this:
 *
 *   - it matches the word "import" inside a comment. `version-badge.tsx` explains
 *     in a comment why it uses `import type`, and a naive scan read that
 *     explanation as a real import of a `node:fs` module.
 *   - it cannot tell `import type { X }` from a real one, which is the exact
 *     distinction the boundary depends on.
 *
 * TypeScript 7 ships no JS parser API to lean on, so this stays textual — but it
 * is anchored and comment-free, which is what made the naive version wrong.
 */
function valueImports(file: string): string[] {
  const raw = readFileSync(file, "utf8")
  // Blank out comments, preserving line structure so `^` anchors still work.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

  const specs: string[] = []

  // `import … from "x"`, one per statement.
  const fromRe = /^import\s+([\s\S]*?)\s+from\s+"([^"]+)"/gm
  for (const m of src.matchAll(fromRe)) {
    const clause = m[1].trim()
    // `import type { X }` — erased entirely.
    if (/^type\b/.test(clause)) continue

    // `import { type A, type B }` also erases to nothing at runtime.
    const braces = clause.match(/\{([\s\S]*)\}/)
    if (braces) {
      const parts = braces[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
      const allTypeOnly =
        parts.length > 0 && parts.every((p) => /^type\b/.test(p))
      if (allTypeOnly) continue
    }

    specs.push(m[2])
  }

  // Side-effect imports: `import "./styles.css"` has no `from`.
  for (const m of src.matchAll(/^import\s+"([^"]+)"/gm)) {
    specs.push(m[1])
  }

  return specs
}

describe("client-importable order vocabulary", () => {
  it("keeps src/lib/order-event.ts free of any import", () => {
    // Stronger than a denylist of today's server modules: a pure vocabulary
    // module needs nothing but its own types, so *any* import is a sign that
    // emit-side code has crept back in — including one added later.
    expect(valueImports(join(LIB, "order-event.ts"))).toEqual([])
  })

  it("keeps the emitter in the server-only module", () => {
    // The inverse: if `emitOrderEvent` moved into the leaf, the leaf would import
    // the notification sink and the whole boundary would be gone.
    const src = readFileSync(join(LIB, "order-events.ts"), "utf8")
    expect(src).toContain("export async function emitOrderEvent")
    expect(valueImports(join(LIB, "order-events.ts"))).toContain(
      "@/lib/notifications",
    )
  })

  it("re-exports the vocabulary, so server call sites keep their import path", () => {
    const src = readFileSync(join(LIB, "order-events.ts"), "utf8")
    // Server modules importing `@/lib/order-events` for a pure helper still
    // resolve; without the re-export this split is a breaking rename.
    expect(src).toMatch(/export\s*\{[\s\S]*?from "@\/lib\/order-event"/)
  })

  it("no module reachable from a client entry point reaches the database", () => {
    // Walks the real import graph rather than grepping for the one path that
    // happened to break. The file that caused it carried no "use client"
    // directive — it was pulled in *by* a client component — so a scan of client
    // files passes while the bundler still fails.
    //
    // The target is `@/lib/db`, not the Node built-ins, because that is where the
    // built-ins actually come from: `db` imports `pg`, and `pg` pulls in fs, net,
    // tls and dns. Nothing in this repo imports those itself, so a guard looking
    // for them finds nothing and proves nothing.
    const FORBIDDEN = new Set(["@/lib/db", "@/lib/db/schema"])

    const resolve = (from: string, spec: string): string | null => {
      if (!spec.startsWith("@/") && !spec.startsWith(".")) return null
      const base = spec.startsWith("@/")
        ? join(SRC, spec.slice(2))
        : join(dirname(from), spec)
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate
        }
      }
      return null
    }

    const seen = new Set<string>()
    const offenders: string[] = []

    function walk(file: string, trail: string[]) {
      if (seen.has(file)) return
      seen.add(file)

      for (const spec of valueImports(file)) {
        if (FORBIDDEN.has(spec)) {
          offenders.push(`${trail.join(" → ")} → ${spec}`)
          continue
        }
        const next = resolve(file, spec)
        if (next) walk(next, [...trail, spec])
      }
    }

    // Every client entry point, as the bundler sees them.
    function collect(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          collect(full)
        } else if (
          /\.(tsx|ts)$/.test(entry.name) &&
          readFileSync(full, "utf8").startsWith('"use client"')
        ) {
          walk(full, [full.replace(`${SRC}/`, "")])
        }
      }
    }

    collect(SRC)

    expect(
      offenders,
      "a client entry point can reach @/lib/db, which drags pg — and so fs, net, tls and dns — into the browser bundle. This fails `pnpm build` while tsc and vitest both pass.",
    ).toEqual([])
  })
})
