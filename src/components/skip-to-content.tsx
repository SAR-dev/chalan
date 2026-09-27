/**
 * Keyboard skip link (ROADMAP P4.4).
 *
 * The sidebar + header chrome sits ahead of the page content in the tab order,
 * so a keyboard user had to traverse it on every navigation. This is the
 * standard first-focusable-element escape hatch: visually hidden until focused,
 * then pinned to the top-left. Rendered once in the root layout; every `<main>`
 * landmark in the app carries the matching `id`.
 */
export function SkipToContent({
  targetId = "main-content",
}: {
  targetId?: string
}) {
  return (
    <a
      href={`#${targetId}`}
      className="bg-background text-foreground focus:not-sr-only sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to main content
    </a>
  )
}
