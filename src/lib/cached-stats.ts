import { revalidateTag, unstable_cache } from "next/cache"
import { logger, serializeError } from "@/lib/logger"

/**
 * — shared caching for dashboard stat tiles.
 *
 * Before this module every stat tile was recomputed from scratch on each
 * render. This wraps the ones that are *displayed totals* (as opposed to
 * pagination seeds) so they are reused for a short window, and it fixes the two
 * ways a `unstable_cache` call in this codebase could quietly go wrong:
 *
 * 1. **A role-independent key.** The first cached aggregate here took no
 *    arguments, so a warehouse admin and a super admin shared one entry. The
 *    key is now `fixedKey + JSON.stringify(args)` (verified at
 *    `next/dist/esm/server/web/spec-extension/unstable-cache.js:79`), so
 *    `load` must receive its scope as *arguments* and must never close over the
 *    session. `requireSession()` belongs above the call, not inside `load`.
 * 2. **A tag with no caller.** A tag nothing ever invalidates is just a slower
 *    `count(*)` with extra steps. `cachedStats` refuses to build a cache entry
 *    with no tags, and `refreshStats` is the single way writes expire them, so
 *    the TTL is a backstop rather than the only mechanism.
 *
 * Pagination totals are deliberately *not* cached: they must move the moment
 * the user acts, they depend on the whole active filter set, and they drive a
 * visible page count.
 */

/** How long a stat tile may be reused before it is recomputed. */
export const STATS_TTL_SECONDS = 30

/**
 * Namespace for cache tags so they cannot collide with anything else that
 * happens to call itself "orders".
 */
export function statTag(name: string): string {
  return `stat:${name}`
}

/**
 * Cache a stat-tile aggregate.
 *
 * `load` receives its scope as plain serialisable values — a warehouse id, a
 * role, a status — because those become part of the cache key. Pass anything
 * that is not serialisable (a session, a Drizzle builder, a `Date`) and the
 * key stops meaning what it says.
 */
export function cachedStats<TArgs extends unknown[], TResult>(
  load: (...args: TArgs) => Promise<TResult>,
  options: { key: string; tags: readonly string[]; revalidate?: number },
): (...args: TArgs) => Promise<TResult> {
  const { key, tags, revalidate = STATS_TTL_SECONDS } = options

  if (!key) {
    throw new Error(
      "cachedStats: `key` is required — it is the stable half of the cache key.",
    )
  }
  if (tags.length === 0) {
    // Failing at module load rather than at first render: a tile nobody can
    // expire is worse than no cache, because the staleness is unbounded.
    throw new Error(
      `cachedStats(${key}): at least one tag is required, and something must call refreshStats() with it.`,
    )
  }

  return unstable_cache(load, [key], { revalidate, tags: [...tags] })
}

/**
 * Expire stat tiles after a write.
 *
 * `{ expire: 0 }` rather than the bare `revalidateTag(tag)`: the single-argument
 * form is deprecated as of Next 16, and `updateTag` — the immediate-expiry
 * replacement — is only available in Server Actions. These writes are Route
 * Handlers, so the documented route-handler form is the correct one. Stale
 * content is never served, so the next read recomputes.
 *
 * Failures are logged and swallowed. This is a cache *hint*: the write it
 * accompanies has already committed, and turning a successful merchant approval
 * into a 500 because a hint could not be recorded would be strictly worse than
 * serving a tile that is up to `STATS_TTL_SECONDS` old. It also throws for a
 * real reason outside a request — `revalidateTag` needs the static-generation
 * store, so any call from a seed script or a cron job hits
 * "Invariant: static generation store missing".
 */
export function refreshStats(...tags: string[]): void {
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 })
    } catch (err) {
      logger.warn("stat cache refresh failed; falling back to the TTL", {
        tag,
        err: serializeError(err),
      })
    }
  }
}
