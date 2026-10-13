import { List } from "lucide-react"
import type { TocEntry } from "@/lib/help-toc"

/**
 * On-page contents for a help guide.
 *
 * The admin guide is nine numbered sections and the warehouse guide ten; without
 * this the only way between them is a scroll wheel or a browser find.
 *
 * A short guide is left alone — two entries would be a list longer than the
 * content it indexes.
 */
export function HelpToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 3) return null

  return (
    <nav
      aria-labelledby="help-toc-heading"
      data-testid="help-toc"
      className="bg-card/60 border-border/70 mb-10 rounded-xl border p-5"
    >
      <p
        id="help-toc-heading"
        className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase"
      >
        <List className="size-3.5" aria-hidden />
        On this page
      </p>
      <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map((entry, i) => (
          <li key={entry.id} className="flex min-w-0 items-baseline gap-2">
            <span
              aria-hidden
              className="text-muted-foreground/50 w-4 shrink-0 text-right font-mono text-xs tabular-nums"
            >
              {i + 1}
            </span>
            <a
              href={`#${entry.id}`}
              className="text-muted-foreground hover:text-foreground min-w-0 truncate text-sm transition-colors hover:underline"
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
