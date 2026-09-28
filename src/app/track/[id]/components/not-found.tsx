import { ArrowRight, Package, Search } from "lucide-react"
import Link from "next/link"

// ─── not found ────────────────────────────────────────────────────────────────

export function NotFound({ code }: { code: string }) {
  return (
    <div className="bg-card rounded-2xl border p-6 text-center shadow-sm sm:p-10">
      <div className="bg-muted ring-border mb-5 inline-flex size-14 items-center justify-center rounded-2xl ring-1">
        <Package className="text-muted-foreground size-6" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Parcel not found</h2>
      <p className="text-muted-foreground mx-auto mb-6 max-w-sm text-sm leading-relaxed text-pretty">
        We couldn&apos;t find a parcel for{" "}
        <span className="text-foreground font-mono">{code}</span>. Double-check
        the code — it usually starts with{" "}
        <span className="text-foreground font-mono">ORD-</span> — and try again.
      </p>

      {/* Inline search so the user doesn't need to navigate back */}
      <form
        method="GET"
        action="/track"
        className="mx-auto flex max-w-sm flex-col gap-2.5 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            name="code"
            placeholder="Try another code…"
            aria-label="Tracking code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-11 w-full rounded-xl border pr-3.5 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Track <ArrowRight className="size-3.5" />
        </button>
      </form>

      <p className="text-muted-foreground mt-5 text-xs">
        Still stuck?{" "}
        <Link href="/faq" className="text-primary font-medium hover:underline">
          Read the FAQ
        </Link>{" "}
        or contact the merchant who booked your parcel.
      </p>
    </div>
  )
}
