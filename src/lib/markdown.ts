/**
 * Collapse markdown to a single line of plain text for one-line previews
 * (inbox rows, bell dropdown items).
 *
 * Rendered markdown lives on the detail page; these previews are `truncate`
 * spans, so a literal `# ` or `**bold**` would leak the source syntax into a
 * one-line row. Deliberately regex-based rather than a full parse — it only
 * ever runs on strings that are about to be displayed truncated, and a
 * slightly imperfect strip beats shipping a parser for a preview.
 *
 * Not a security boundary: the result is rendered as text (React escapes it),
 * never as HTML.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Code fences: keep the contents, drop the ``` markers and language tag.
      .replace(/^\s*```[\w-]*\s*$/gm, " ")
      // Images: keep alt text, drop the URL (![alt](url) → alt).
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links: keep the label, drop the URL ([label](url) → label).
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Reference-style links ([label][id] → label).
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      // ATX headings (## Title → Title) and closing # runs.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/\s+#+\s*$/gm, "")
      // Blockquote markers.
      .replace(/^\s{0,3}>\s?/gm, "")
      // List bullets / ordered markers at line start.
      .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
      // Horizontal rules on their own line.
      .replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
      // Emphasis markers. `**`/`__` first so `*` alone doesn't mangle them.
      .replace(/(\*\*|__)([^*_]+)(\*\*|__)/g, "$2")
      .replace(/(\*|_)([^*_]+)(\*|_)/g, "$2")
      .replace(/~~([^~]+)~~/g, "$1")
      // Inline code backticks.
      .replace(/`([^`]+)`/g, "$1")
      // Strikethrough lone markers left over from partial matches.
      .replace(/~/g, "")
      // Collapse all whitespace runs (including newlines) to single spaces.
      .replace(/\s+/g, " ")
      .trim()
  )
}
