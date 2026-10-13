/**
 * Deriving a help guide's table of contents from its own markdown.
 *
 * Pure and in `lib`, because three things need it: the contents component, the
 * heading renderer (which has to emit matching anchor ids), and the guide page.
 * Putting the slug rule in one place is the point — a TOC whose links do not
 * resolve is worse than no TOC, and the two would drift the moment either side
 * was edited alone.
 */

export interface TocEntry {
  id: string
  label: string
}

/**
 * A stable, readable anchor for a heading.
 *
 * GitHub's rule: lower-case, spaces to hyphens, punctuation dropped. That keeps
 * `/help/admin#5-configure-zones-and-pricing` legible and stable for as long as
 * the heading text is.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
}

/**
 * The guide's own `##` headings, in document order.
 *
 * Only `##` — a guide's numbered steps. Including `###` would triple the list on
 * the API page, where three sub-headings sit under "Orders".
 *
 * Parsed from the raw markdown rather than stored beside it, so a heading added
 * to a guide cannot go missing from the contents the way a hand-maintained list
 * would eventually allow.
 */
export function tocFromMarkdown(markdown: string): TocEntry[] {
  const entries: TocEntry[] = []
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const label = match[1].replace(/[`*_~]/g, "").trim()
    if (!label) continue
    entries.push({ id: slugifyHeading(label), label })
  }
  return entries
}
