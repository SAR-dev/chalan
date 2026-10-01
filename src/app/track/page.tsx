import {
  ArrowRight,
  Check,
  ClipboardList,
  LifeBuoy,
  Package,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react"
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

const trustPoints = [
  "No account needed",
  "Live status updates",
  "Works on any device",
]

const steps = [
  {
    icon: ClipboardList,
    title: "Enter your code",
    desc: "Type the tracking code from your delivery SMS or the parcel label.",
  },
  {
    icon: Truck,
    title: "Watch it move",
    desc: "See every checkpoint as your parcel travels to the sorting hub.",
  },
  {
    icon: PackageCheck,
    title: "Get it delivered",
    desc: "Follow the rider to your door — and leave a delivery note.",
  },
]

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
    <main
      id="main-content"
      className="bg-background relative min-h-screen overflow-hidden"
    >
      {/* Decorative backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[26rem]"
      >
        <div className="from-chart-1/15 absolute left-1/2 top-[-11rem] h-[24rem] w-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-sm">
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

      <div className="relative mx-auto max-w-2xl px-5 pt-14 pb-20">
        {/* Hero */}
        <div className="text-center">
          <div className="from-primary/15 ring-primary/20 mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br to-transparent ring-1">
            <Package className="text-primary size-6" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Track your parcel
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-relaxed text-pretty">
            Enter your tracking code for live delivery updates — no account
            needed.
          </p>
        </div>

        {/* Search — uses GET so it's fully SSR, no JS required */}
        <form method="GET" action="/track" className="mx-auto mt-8 max-w-lg">
          <div className="bg-card ring-border/70 focus-within:ring-primary/40 flex flex-col gap-2 rounded-2xl p-2 shadow-sm ring-1 transition-all focus-within:shadow-md sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <input
                name="code"
                placeholder="Enter tracking code — e.g. ORD-100001"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label="Tracking code"
                className="text-foreground placeholder:text-muted-foreground h-11 w-full rounded-xl border-0 bg-transparent pr-3 pl-10 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-medium shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Track
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </form>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          Your code is printed on the delivery note — it starts with{" "}
          <span className="text-foreground font-mono">ORD-</span>
        </p>

        {/* Trust badges */}
        <div className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
          {trustPoints.map((point) => (
            <span key={point} className="inline-flex items-center gap-1.5">
              <span className="bg-chart-2/10 text-chart-2 flex size-4 items-center justify-center rounded-full">
                <Check className="size-2.5" />
              </span>
              {point}
            </span>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-16">
          <p className="text-primary text-center text-xs font-semibold tracking-widest uppercase">
            How it works
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-card/60 rounded-xl border p-4 text-center sm:text-left"
              >
                <div className="bg-primary/10 text-primary mx-auto flex size-9 items-center justify-center rounded-lg sm:mx-0">
                  <Icon className="size-4" />
                </div>
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Help */}
        <div className="bg-muted/40 mt-10 rounded-2xl border p-5 text-center">
          <div className="text-muted-foreground inline-flex items-center gap-2 text-xs font-medium">
            <LifeBuoy className="size-3.5" />
            Lost your tracking code?
          </div>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-xs leading-relaxed">
            Check the SMS or email your merchant sent when the parcel was
            booked, or contact the merchant directly.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
            <Link
              href="/help"
              className="text-primary font-medium hover:underline"
            >
              Visit the help center
            </Link>
          </div>
        </div>
      </div>

      <PublicFooter />
    </main>
  )
}
