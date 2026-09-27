import { ArrowLeft, Package } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteConfig } from "@/config/site"
import { brandThemeVars } from "@/lib/brand-color"
import { NotFound } from "./components/not-found"
import { OrderDetail } from "./components/order-detail"
import { fetchOrderData, STATUS_COPY } from "./lib"

// ─── page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  // Pass the raw segment through: it may be the (lowercase) tracking token.
  // fetchOrderData normalizes for the human-code arm internally.
  const raw = decodeURIComponent(id).trim()
  const data = await fetchOrderData(raw)

  const statusLabel = data
    ? STATUS_COPY[data.order.status].headline
    : "Not found"
  const merchant = data?.merchant?.businessName
    ? ` · ${data.merchant.businessName}`
    : ""
  // Prefer the human-readable order code in the page title.
  const code = data?.order.id ?? raw.toUpperCase()

  return {
    title: `${code} – ${statusLabel}`,
    description: `Live delivery status for parcel ${code}${merchant} on ${siteConfig.name}.`,
    robots: { index: false, follow: false },
  }
}

export default async function TrackDetailPage({ params }: Props) {
  const { id } = await params
  const raw = decodeURIComponent(id).trim()
  const data = await fetchOrderData(raw)
  const idOrCode = data?.order.id ?? raw.toUpperCase()

  // Branding follows the ORDER's merchant (multi-merchant safe), never the
  // instance — invalid hex makes brandThemeVars fall back to theme defaults.
  const merchant = data?.merchant ?? null
  const brandVars = merchant?.brandColor
    ? brandThemeVars(merchant.brandColor)
    : undefined

  const defaultChip = (
    <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md shadow-sm transition-shadow group-hover:shadow-md">
      <Package className="size-3.5" />
    </span>
  )

  // If not found, render a friendly not-found UI (don't use Next's notFound()
  // so we can still show the search header)
  return (
    <main
      className="bg-background min-h-screen"
      style={brandVars as React.CSSProperties | undefined}
    >
      {brandVars && (
        <div className="bg-primary h-1.5" data-testid="track-accent" />
      )}
      {/* Header */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <Link
            href="/track"
            className="group flex min-w-0 items-center gap-2.5"
          >
            {merchant?.logoUrl ? (
              <img
                src={merchant.logoUrl}
                alt={merchant.businessName}
                className="size-7 shrink-0 rounded-md object-contain"
                data-testid="track-brand-logo"
              />
            ) : (
              defaultChip
            )}
            <span
              className="truncate text-sm font-semibold tracking-tight"
              data-testid="track-brand"
            >
              {merchant
                ? `Fulfilled by ${merchant.businessName}`
                : siteConfig.name}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
              Order Tracking
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8">
        {/* Back / search again button */}
        <Link
          href="/track"
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Track another parcel
        </Link>

        {!data ? <NotFound code={idOrCode} /> : <OrderDetail {...data} />}
      </div>
      {!merchant?.hidePlatformBranding && <PublicFooter />}
    </main>
  )
}
