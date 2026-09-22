import { ArrowRight, Package, Search } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteConfig } from "@/config/site"

const trackTitle = `Track Your Parcel – ${siteConfig.name}`
const trackDescription = `Enter your ${siteConfig.name} tracking code to get live delivery status updates — from pickup to doorstep.`
const trackOgDescription = `Get real-time delivery updates for your ${siteConfig.name} shipment.`

export const metadata: Metadata = {
  title: "Track Your Parcel",
  description: trackDescription,
  alternates: {
    canonical: "/track",
  },
  openGraph: {
    title: trackTitle,
    description: trackOgDescription,
    url: "/track",
  },
  twitter: {
    title: trackTitle,
    description: trackOgDescription,
  },
}

interface Props {
  searchParams: Promise<{ code?: string }>
}

export default async function TrackPage({ searchParams }: Props) {
  const { code } = await searchParams
  const trimmed = (code ?? "").trim()

  // If a code was submitted via GET form, redirect to the detail page
  if (trimmed) {
    redirect(`/track/${encodeURIComponent(trimmed)}`)
  }

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

      <div className="mx-auto max-w-2xl px-5 py-12">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="bg-primary/8 ring-primary/15 mb-5 inline-flex size-14 items-center justify-center rounded-2xl ring-1">
            <Package className="text-primary size-6" />
          </div>
          <h1 className="mb-2.5 text-3xl font-semibold tracking-tight">
            Track your parcel
          </h1>
          <p className="text-muted-foreground mx-auto max-w-xs text-sm leading-relaxed">
            Enter your tracking code for live delivery updates — no account
            needed.
          </p>
        </div>

        {/* Search form — uses GET so it's fully SSR, no JS required */}
        <form
          method="GET"
          action="/track"
          className="mx-auto flex max-w-lg gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              name="code"
              placeholder="Tracking code — e.g. PF-100231"
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-lg border pr-3.5 pl-9 text-sm transition-shadow focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              aria-label="Tracking code"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:gap-1.5 sm:px-4"
          >
            <span className="hidden sm:inline">Track </span>
            <ArrowRight className="size-3.5" />
          </button>
        </form>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          Your code is printed on the delivery note — it starts with{" "}
          <span className="text-foreground font-mono">PF-</span>
        </p>
      </div>
      <PublicFooter />
    </main>
  )
}
