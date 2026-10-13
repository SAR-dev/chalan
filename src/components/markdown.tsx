import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { slugifyHeading } from "@/lib/help-toc"
import { cn } from "@/lib/utils"

/** Heading text as a plain string, for the anchor id. */
function flattenChildren(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(flattenChildren).join("")
  }
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props
    return flattenChildren(props?.children ?? "")
  }
  return ""
}

/**
 * Styling for the help guides' markdown.
 *
 * There is no `@tailwindcss/typography` here — it is not a dependency — so the
 * `prose prose-gray dark:prose-invert` classes this component used to carry were
 * dead weight that resolved to nothing. Every element is styled explicitly
 * instead, which is why `pre` and `code` now render at all: previously they had
 * no background, no padding and `overflow-x: visible`, so a long `curl` example
 * pushed the document to 1024px wide on a 390px phone and the whole page
 * scrolled sideways.
 */
const components: Partial<Components> = {
  h1: ({ children }) => (
    <h1 className="mb-4 text-3xl font-bold tracking-tight text-balance">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    // The id matches `slugifyHeading` in `src/app/help/toc.tsx`, so every entry
    // in the contents list resolves to its heading. Without it the TOC links
    // would be decorative.
    <h2
      id={slugifyHeading(flattenChildren(children))}
      className="mt-12 mb-3 scroll-mt-24 border-b border-border/70 pb-2 text-xl font-semibold tracking-tight"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-7 mb-2 text-base font-semibold tracking-tight">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-muted-foreground mb-4 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 ml-5 list-disc space-y-2 [&>li::marker]:text-muted-foreground/60">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 ml-5 list-decimal space-y-2 [&>li::marker]:text-muted-foreground/60">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-muted-foreground leading-relaxed [&>ul]:mt-2 [&>ol]:mt-2">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  /**
   * Internal links stay in the tab. Opening `/help/warehouse-admin` in a new tab
   * loses the reader's place in the page they came from, and the Help Center
   * cross-links are the main way to move between guides.
   */
  a: ({ href, children }) => {
    const internal = href?.startsWith("/") || href?.startsWith("#")
    if (internal) {
      return (
        <a
          href={href}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {children}
        </a>
      )
    }
    return (
      <a
        href={href}
        className="text-primary font-medium underline-offset-4 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  },
  /**
   * The API guide is mostly code, so a block is a first-class surface here
   * rather than incidental text: a tinted panel that scrolls inside itself.
   * Without `overflow-x-auto` a long line stretches the document instead.
   */
  pre: ({ children }) => (
    <pre className="bg-muted/50 border-border/70 my-5 overflow-x-auto rounded-lg border p-4 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    // A fenced block is already wrapped by `pre`, which owns the panel. Styling
    // the inner `code` again is what produced a double background before.
    const fenced = className?.startsWith("language-")
    if (fenced) {
      return (
        <code className={cn("font-mono", className)} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="border-primary/40 bg-primary/5 text-foreground/90 my-5 rounded-r-md border-l-4 py-3 pr-4 pl-4 [&>p]:mb-0 [&>p]:leading-relaxed">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-5 w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border bg-muted/50 border-b px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border/60 text-muted-foreground border-b px-3 py-2 align-top">
      {children}
    </td>
  ),
  hr: () => <hr className="border-border my-8" />,
}

export function Markdown({ content }: { content: string }) {
  return (
    // `min-w-0` so the wrapper participates in flex/grid shrink correctly and a
    // wide `pre` scrolls inside itself rather than widening the page.
    <div className="min-w-0 text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
