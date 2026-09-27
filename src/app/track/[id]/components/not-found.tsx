import { ArrowRight, Package, Search } from "lucide-react"

// ─── not found ────────────────────────────────────────────────────────────────

export function NotFound({ code }: { code: string }) {
  return (
    <div className="py-12 text-center">
      <div className="bg-muted ring-border mb-5 inline-flex size-14 items-center justify-center rounded-2xl ring-1">
        <Package className="text-muted-foreground size-6" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Parcel not found</h2>
      <p className="text-muted-foreground mx-auto mb-6 max-w-xs text-sm leading-relaxed">
        No parcel found for{" "}
        <span className="text-foreground font-mono">{code}</span>. Double-check
        your tracking code and try again.
      </p>

      {/* Inline search so user doesn't need to navigate back */}
      <form
        method="GET"
        action="/track"
        className="mx-auto flex max-w-sm gap-2.5"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            name="code"
            placeholder="Try another code…"
            aria-label="Tracking code"
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-lg border pr-3.5 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium shadow-sm transition-colors"
        >
          Track <ArrowRight className="size-3.5" />
        </button>
      </form>
    </div>
  )
}
