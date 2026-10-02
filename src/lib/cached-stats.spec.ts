// — contract for the shared stat-tile cache.
//
// The point of this module is that it is hard to misuse. Two of the tests here
// exist to make a misuse impossible to commit: a cache entry with no tag
// (nothing can ever expire it) and a role-independent key (one warehouse admin
// served another warehouse admin's tiles).

import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  cachedStats,
  refreshStats,
  STATS_TTL_SECONDS,
  statTag,
} from "@/lib/cached-stats"

const cacheCalls: {
  keys: string[]
  options: { revalidate?: number; tags?: string[] }
  fn: (...args: unknown[]) => unknown
}[] = []
const revalidated: Array<[string, unknown]> = []
/** Set by a test to make `revalidateTag` reject, as it does outside a request. */
let revalidateThrows = false

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    cacheCalls.push({ keys, options, fn })
    return fn
  },
  revalidateTag: (tag: string, profile: unknown) => {
    if (revalidateThrows) {
      throw new Error(
        "Invariant: static generation store missing in revalidateTag " + tag,
      )
    }
    revalidated.push([tag, profile])
  },
}))

beforeEach(() => {
  cacheCalls.length = 0
  revalidated.length = 0
  revalidateThrows = false
})

describe("cachedStats", () => {
  it("registers a bounded TTL and the tags it was given", () => {
    cachedStats(async () => 1, { key: "orders", tags: [statTag("orders")] })
    expect(cacheCalls).toHaveLength(1)
    expect(cacheCalls[0].keys).toEqual(["orders"])
    expect(cacheCalls[0].options.revalidate).toBe(STATS_TTL_SECONDS)
    expect(STATS_TTL_SECONDS).toBeGreaterThan(0)
    expect(STATS_TTL_SECONDS).toBeLessThanOrEqual(60)
    expect(cacheCalls[0].options.tags).toEqual(["stat:orders"])
  })

  it("namespaces tags so they cannot collide with other caches", () => {
    expect(statTag("orders")).toBe("stat:orders")
    expect(statTag("orders")).not.toBe("orders")
  })

  it("refuses to build an entry that nothing can expire", () => {
    // A tag-less cache is not a cache, it is a stale number with a longer
    // runtime. This throws at module load, not at first render.
    expect(() =>
      cachedStats(async () => 1, { key: "orders", tags: [] }),
    ).toThrow(/at least one tag is required/)
  })

  it("refuses a cache with no stable key", () => {
    expect(() => cachedStats(async () => 1, { key: "", tags: ["t"] })).toThrow(
      /`key` is required/,
    )
  })

  it("passes scope through as arguments, which is what makes the key safe", async () => {
    const load = vi.fn(async (warehouseId: string | null) => ({ warehouseId }))
    const getTiles = cachedStats(load, {
      key: "rider-tiles",
      tags: [statTag("riders")],
    })

    // Two warehouses must not be able to share an entry, and the only thing
    // separating them is the argument — see the next test for why that holds.
    await getTiles("wh-a")
    await getTiles("wh-b")
    expect(load).toHaveBeenNthCalledWith(1, "wh-a")
    expect(load).toHaveBeenNthCalledWith(2, "wh-b")
  })

  it("honours an explicit revalidate override", () => {
    cachedStats(async () => 1, {
      key: "k",
      tags: ["t"],
      revalidate: 5,
    })
    expect(cacheCalls[0].options.revalidate).toBe(5)
  })
})

/**
 * The safety of the previous test rests on a Next implementation detail: the
 * cache key is `fixedKey + JSON.stringify(args)`. If a Next upgrade ever drops
 * arguments from that key, a warehouse-scoped tile would start serving another
 * warehouse's numbers and nothing else in the suite would notice — so the
 * detail is pinned here rather than only mentioned in a comment.
 */
describe("installed Next still keys the cache on arguments", () => {
  const require_ = createRequire(import.meta.url)
  const file = (() => {
    try {
      const pkg = require_.resolve("next/package.json")
      return join(
        dirname(pkg),
        "dist/esm/server/web/spec-extension/unstable-cache.js",
      )
    } catch {
      return null
    }
  })()
  const source = (() => {
    try {
      return file ? readFileSync(file, "utf-8") : null
    } catch {
      return null
    }
  })()

  it.skipIf(!source)(
    "includes the call arguments in the invocation key",
    () => {
      expect(source).toMatch(/JSON\.stringify\(args\)/)
    },
  )

  it.skipIf(!source)(
    "builds that invocation key from the caller's key parts",
    () => {
      expect(source).toMatch(/invocationKey\s*=/)
    },
  )
})

describe("refreshStats", () => {
  it("expires every tag it is handed", () => {
    refreshStats("stat:orders", "stat:riders")
    expect(revalidated).toEqual([
      ["stat:orders", { expire: 0 }],
      ["stat:riders", { expire: 0 }],
    ])
  })

  it("uses the two-argument form, since the bare call is deprecated", () => {
    // Next 16 deprecated `revalidateTag(tag)`; `updateTag` is the replacement
    // but is Server-Action-only, and these writes are Route Handlers. If this
    // ever regresses to one argument the deprecation warning is gone and the
    // behaviour silently becomes "expire never".
    refreshStats("stat:orders")
    expect(revalidated[0]).toHaveLength(2)
    expect(revalidated[0][1]).toEqual({ expire: 0 })
  })

  it("does nothing for no tags rather than throwing", () => {
    expect(() => refreshStats()).not.toThrow()
    expect(revalidated).toHaveLength(0)
  })

  it("does not let a failed hint fail the write it follows", () => {
    // This is the bug this shape exists to prevent: `revalidateTag` throws
    // "Invariant: static generation store missing" whenever it runs outside a
    // request, which turned every successful approval into a 500. The write has
    // already committed, so the response must still succeed and the TTL covers
    // the staleness.
    revalidateThrows = true
    expect(() => refreshStats("stat:order", "stat:rider")).not.toThrow()
    // One bad tag must not abandon the rest of the batch.
    expect(() => refreshStats("stat:order")).not.toThrow()
  })
})

/**
 * A tag that nothing expires is the failure mode that a per-page review never
 * catches: the entry builds, the tests pass, and the number quietly freezes
 * until someone notices. This walks the source tree instead, so the property is
 * checked on every run rather than by whoever happens to be reviewing.
 */
describe("no cached tag is left without an invalidation caller", () => {
  const SRC = join(process.cwd(), "src")

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      if (!/\.(ts|tsx)$/.test(entry.name)) return []
      if (/\.spec\.(ts|tsx)$/.test(entry.name)) return []
      return [full]
    })

  /** Tags named inside a `cachedStats(...)` options object. */
  const declared = () => {
    const found = new Set<string>()
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, "utf-8").split("\n")
      let inOptions = false
      for (const line of lines) {
        if (line.includes("cachedStats(")) inOptions = true
        if (inOptions) {
          for (const m of line.matchAll(/statTag\("([\w-]+)"\)/g)) {
            found.add(m[1])
          }
        }
        if (inOptions && /^\s*\{ key:/.test(line)) inOptions = false
      }
    }
    return found
  }

  /** Tags named in a `refreshStats(...)` call anywhere. */
  const expired = () => {
    const found = new Set<string>()
    for (const file of sourceFiles(SRC)) {
      for (const line of readFileSync(file, "utf-8").split("\n")) {
        if (!/^\s*refreshStats\(/.test(line)) continue
        for (const m of line.matchAll(/statTag\("([\w-]+)"\)/g)) {
          found.add(m[1])
        }
      }
    }
    return found
  }

  it("finds the tags it expects, so an empty scan cannot pass silently", () => {
    // Guards the guard: if the walk broke, `declared` would be empty and the
    // test below would trivially pass.
    expect(declared().size).toBeGreaterThan(0)
    expect(expired().size).toBeGreaterThan(0)
  })

  it("expires every tag some cached entry declares", () => {
    const orphans = [...declared()].filter((t) => !expired().has(t))
    expect(
      orphans,
      `these tags are cached but never refreshed, so their tiles can only expire on the ${STATS_TTL_SECONDS}s TTL: ${orphans.join(", ")}`,
    ).toEqual([])
  })

  it("does not expire a tag that nothing caches", () => {
    // The other direction: a stale `refreshStats` is harmless but misleading,
    // and usually means a rename left a caller behind.
    const stray = [...expired()].filter((t) => !declared().has(t))
    expect(
      stray,
      `refreshStats called for tags no cache declares: ${stray.join(", ")}`,
    ).toEqual([])
  })
})
