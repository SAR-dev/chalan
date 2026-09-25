import { ArrowLeft, Package } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteConfig } from "@/config/site"
import { NotFound } from "./components/not-found"
import { OrderDetail } from "./components/order-detail"
import { fetchOrderData, STATUS_COPY } from "./lib"

// ─── page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const code = decodeURIComponent(id).trim().toUpperCase()
  const data = await fetchOrderData(code)

  const statusLabel = data
    ? STATUS_COPY[data.order.status].headline
    : "Not found"
  const merchant = data?.merchant?.businessName
    ? ` · ${data.merchant.businessName}`
    : ""

  return {
    title: `${code} – ${statusLabel}`,
    description: `Live delivery status for parcel ${code}${merchant} on ${siteConfig.name}.`,
    robots: { index: false, follow: false },
  }
}

export default async function TrackDetailPage({ params }: Props) {
  const { id } = await params
  const idOrCode = decodeURIComponent(id).trim().toUpperCase()
  const data = await fetchOrderData(idOrCode)

  // If not found, render a friendly not-found UI (don't use Next's notFound()
  // so we can still show the search header)
  return (
    <main className="bg-background min-h-screen">
      {/* Header */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <Link href="/track" className="group flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md shadow-sm transition-shadow group-hover:shadow-md">
              <Package className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              {siteConfig.name}
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
      <PublicFooter />
    </main>
  )
}
