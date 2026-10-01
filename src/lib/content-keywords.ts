import { appContent } from "@/config/site"

type ContentKey = keyof typeof appContent

/**
 * Substitutes every `{{TOKEN}}` a content markdown file may carry.
 *
 * Derived from the keys of `appContent` rather than a hand-written chain of
 * `.replace()` calls — adding a field to `AppContent` makes that token
 * available to every content file at once, so the token set and the config can
 * no longer drift apart.
 *
 * An unknown **or empty** value is deliberately left in place rather than
 * blanked. Blanking would silently publish a sentence with a hole in it, and
 * an unset legal field (say, a buyer who cleared the address) would vanish
 * without trace. Leaving the token visible means the problem shows up in review
 * and is caught by `content-keywords.spec.ts` before release.
 *
 * Shared by every page that renders from `src/content/` (FAQ, help guides,
 * privacy, terms).
 */
export function replaceContentKeywords(content: string): string {
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => {
    const value = appContent[key as ContentKey]
    return value ? String(value) : whole
  })
}

/**
 * `{{TOKEN}}` occurrences that `replaceContentKeywords` cannot resolve — either
 * no such key exists, or the config value behind it is empty.
 *
 * Exported so a test can fail the build on them rather than letting an
 * unsubstituted placeholder reach a published page.
 */
export function unresolvedContentKeywords(content: string): string[] {
  const found = new Set<string>()
  for (const match of content.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
    const key = match[1]
    const value = appContent[key as ContentKey]
    if (!value) found.add(key)
  }
  return [...found]
}
