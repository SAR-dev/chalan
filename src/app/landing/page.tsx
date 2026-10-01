import { asc } from "drizzle-orm"
import {
  ArrowRight,
  Banknote,
  Bike,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Footprints,
  HandCoins,
  Home,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Package,
  PackageCheck,
  Route,
  ScanLine,
  ShieldCheck,
  Star,
  Truck,
  Users,
  Warehouse,
  Zap,
} from "lucide-react"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import Link from "next/link"
import { DeliveryFeeCalculator } from "@/components/delivery-fee-calculator"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { SiteIcon, siteConfig } from "@/config/site"
import { dbRead } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"

// Shown only when the DB is unreachable (e.g. during build), so the marketing
// page still renders. Never used to price a real order — see the lane lookup
// below. Mirrors the seeded Dhaka-metro lane.
const SAMPLE_PRICING = {
  baseRate: 60,
  extraRatePerKg: 10,
  freeWeightKg: 1,
  maxWeightKg: 10,
  codFeePercentage: 1,
  cancellationFee: 20,
}

// Cache the "from" rate for 5 minutes — this page is heavily fetched and
// pricing rarely changes (set by an admin per lane).
//
// There is no platform-wide rate any more: delivery pricing lives per lane in
// `zone_pricing`, and an unconfigured lane is an error rather than a fallback.
// The public calculator takes a single rate, so this is the *cheapest*
// configured lane — which is what a "from TK X" headline should actually mean.
const getCachedPlatformConfig = unstable_cache(
  async () => {
    try {
      const cheapestLane = await dbRead
        .select({
          baseRate: zonePricing.baseRate,
          extraRatePerKg: zonePricing.extraRatePerKg,
          freeWeightKg: zonePricing.freeWeightKg,
          maxWeightKg: zonePricing.maxWeightKg,
          codFeePercentage: zonePricing.codFeePercentage,
          cancellationFee: zonePricing.cancellationFee,
        })
        .from(zonePricing)
        .orderBy(asc(zonePricing.baseRate))
        .limit(1)
        .then((r) => r[0])

      return cheapestLane ?? SAMPLE_PRICING
    } catch {
      return SAMPLE_PRICING
    }
  },
  ["landing-platform-config"],
  { revalidate: 300 },
)

const landingTitle = `Ship Anything. Track Everything. – ${siteConfig.name}`
const landingDescription = `${siteConfig.name} is a B2B courier platform built for Bangladeshi merchants. Register your business, book deliveries, and follow every parcel in real time — all from one place.`
const landingOgDescription =
  "B2B courier platform for Bangladeshi merchants. Real-time tracking, flexible pickup, and transparent pricing."

export const metadata: Metadata = {
  title: "Ship Anything. Track Everything.",
  description: landingDescription,
  authors: [{ name: siteConfig.author }],
  alternates: { canonical: "/" },
  openGraph: {
    title: landingTitle,
    description: landingOgDescription,
    url: "/",
    authors: [siteConfig.author],
    publishedTime: "2026-09-07T00:00:00.000Z",
    images: [siteConfig.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: landingTitle,
    description: landingOgDescription,
    images: [siteConfig.ogImage],
  },
}

// DB-backed pricing must reflect the current config, never a build-time
// snapshot (see the same note in src/app/rates/page.tsx).
export const dynamic = "force-dynamic"

const features = [
  {
    icon: <Package className="size-5" />,
    iconClass: "bg-chart-1/10 text-chart-1",
    title: "Order Management",
    desc: "Create single or bulk orders with delivery city selection, weight-based pricing, and COD amount tracking.",
  },
  {
    icon: <MapPin className="size-5" />,
    iconClass: "bg-chart-2/10 text-chart-2",
    title: "Real-time Tracking",
    desc: "Track every parcel from pickup to doorstep with live status updates and public tracking pages.",
  },
  {
    icon: <Truck className="size-5" />,
    iconClass: "bg-chart-4/10 text-chart-4",
    title: "Rider Fleet",
    desc: "Dedicated pickup and delivery riders with warehouse-assigned routing and cash collection tracking.",
  },
  {
    icon: <Building2 className="size-5" />,
    iconClass: "bg-chart-5/10 text-chart-5",
    title: "Warehouse Operations",
    desc: "Intake queue, dispatch desk, and COD settlement — warehouse admins manage the full flow.",
  },
  {
    icon: <Banknote className="size-5" />,
    iconClass: "bg-chart-3/10 text-chart-3",
    title: "COD & Payouts",
    desc: "Cash-on-delivery collection, automatic balance tracking, and merchant payout requests with admin approval.",
  },
  {
    icon: <Users className="size-5" />,
    iconClass: "bg-accent text-accent-foreground",
    title: "Multi-role Dashboard",
    desc: "Separate dashboards for Super Admin, Warehouse Admin, Merchant, and Rider — each sees what they need.",
  },
  {
    icon: <LifeBuoy className="size-5" />,
    iconClass: "bg-chart-2/10 text-chart-2",
    title: "Help Center",
    desc: "Step-by-step guides for merchants, riders, warehouse admins, and super admins — reachable from every page.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    iconClass: "bg-chart-1/10 text-chart-1",
    title: "Account Security",
    desc: "Optional two-factor authentication with authenticator apps and recovery codes — mandatory for admin teams.",
  },
  {
    icon: <MessageSquare className="size-5" />,
    iconClass: "bg-chart-5/10 text-chart-5",
    title: "In-app Support",
    desc: "Open a support ticket from your dashboard and get replies in-app — no email tag, full history kept.",
  },
]

const journey = [
  {
    icon: ClipboardList,
    title: "Order booked",
    desc: "Priced instantly by city and weight, with the COD amount attached.",
  },
  {
    icon: PackageCheck,
    title: "Picked up",
    desc: "A rider collects parcels from your confirmed pickup location.",
  },
  {
    icon: Footprints,
    title: "Out for delivery",
    desc: "Live status follows the rider door to door, street by street.",
  },
  {
    icon: Home,
    title: "Delivered",
    desc: "COD is collected and settled to your merchant balance.",
  },
]

const howItWorks = [
  {
    step: "Register",
    icon: <FileText className="size-5" />,
    desc: "Fill out the merchant form in under two minutes. Our team reviews and activates your account.",
  },
  {
    step: "Get your rates",
    icon: <Star className="size-5" />,
    desc: "An admin assigns your delivery pricing once approved. First 100 merchants lock in 10% off, forever.",
  },
  {
    step: "Start shipping",
    icon: <Zap className="size-5" />,
    desc: "Book orders, assign pickup locations, and watch real-time status updates as riders move your parcels.",
  },
]

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string
  title: string
  sub?: string
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-primary text-xs font-semibold tracking-widest uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {sub ? (
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
          {sub}
        </p>
      ) : null}
    </div>
  )
}

export default async function LandingPage() {
  const platformPricing = await getCachedPlatformConfig()
  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      {/* ── Nav ── */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <SiteIcon className="size-5" />
            <span className="text-sm font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <div className="hidden items-center gap-1 sm:flex sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/help" />}
                nativeButton={false}
              >
                Help
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="nav-pricing"
                render={<Link href="/rates" />}
                nativeButton={false}
              >
                Pricing
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/login" />}
                nativeButton={false}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                render={<Link href="/register" />}
                nativeButton={false}
              >
                Create merchant account
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="from-chart-1/15 absolute left-1/2 top-[-12rem] h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl" />
            <div className="bg-chart-4/10 absolute top-24 right-[8%] hidden h-64 w-64 rounded-full blur-3xl lg:block" />
            <div className="bg-chart-2/10 absolute top-40 left-[6%] hidden h-64 w-64 rounded-full blur-3xl lg:block" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
            <Link
              href="/help"
              className="border-border/70 bg-background/70 hover:border-primary/40 group inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors"
            >
              <span className="bg-chart-2 relative flex size-2 rounded-full">
                <span className="bg-chart-2 absolute inset-0 animate-ping rounded-full opacity-60" />
              </span>
              New: Help center &amp; in-app ticket support
              <ArrowRight className="text-muted-foreground group-hover:text-primary size-3 transition-colors" />
            </Link>

            <h1 className="mx-auto mt-7 max-w-3xl text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Ship anything.
              <br />
              <span className="from-primary via-chart-4 to-chart-2 bg-gradient-to-r bg-clip-text text-transparent">
                Track everything.
              </span>
            </h1>

            <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
              {siteConfig.name} is a B2B courier platform built for Bangladeshi
              merchants. Register your business, book deliveries, and follow
              every parcel in real time — all from one place.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="gap-2"
                render={<Link href="/register" />}
                nativeButton={false}
              >
                Create your merchant account
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                render={<Link href="/apply/rider" />}
                nativeButton={false}
              >
                <Bike className="size-4" />
                Join as a rider
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="gap-2"
                render={<Link href="/track" />}
                nativeButton={false}
              >
                <MapPin className="size-4" />
                Track a parcel
              </Button>
            </div>

            <p className="text-muted-foreground mt-4 text-xs">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>

            <div className="text-muted-foreground/80 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
              {[
                "Public parcel tracking",
                "COD & next-day payouts",
                "Two-factor account security",
                "Support tickets with in-app replies",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <span className="bg-chart-1/10 text-chart-1 flex size-4 items-center justify-center rounded-full">
                    <Check className="size-2.5" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* ── Product preview ── */}
          <div className="relative mx-auto max-w-4xl px-4 pb-20 sm:px-6">
            <div
              aria-hidden
              className="to-chart-4/20 from-chart-2/20 absolute -inset-3 rounded-3xl bg-gradient-to-tr via-transparent blur-2xl"
            />
            <div className="relative animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
              <div className="bg-card/80 shadow-2xl ring-border/60 overflow-hidden rounded-2xl border ring-1 backdrop-blur">
                {/* window chrome */}
                <div className="border-border/60 flex items-center gap-2 border-b px-4 py-3">
                  <span className="bg-chart-3/80 size-2.5 rounded-full" />
                  <span className="bg-chart-2/80 size-2.5 rounded-full" />
                  <span className="bg-destructive/50 size-2.5 rounded-full" />
                  <span className="text-muted-foreground ml-3 inline-flex items-center gap-1.5 text-xs">
                    <ScanLine className="size-3.5" />
                    {siteConfig.name} — Live order tracking
                  </span>
                  <span className="bg-chart-2/10 text-chart-2 ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                    <span className="bg-chart-2 size-1.5 animate-pulse rounded-full" />
                    Live
                  </span>
                </div>

                <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.5fr_1fr]">
                  {/* left — shipment timeline */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          ORD-48291
                        </span>
                        <span className="border-border/70 text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] font-medium">
                          Express
                        </span>
                      </div>
                      <span className="bg-chart-4/10 text-chart-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                        <Truck className="size-3" />
                        In transit
                      </span>
                    </div>

                    <div className="text-muted-foreground mt-3 inline-flex items-center gap-2 text-xs">
                      <Route className="text-primary size-4" />
                      <span className="font-medium">Dhaka</span>
                      <span className="text-border h-px w-8 bg-current opacity-40" />
                      <span className="font-medium">Chattogram</span>
                      <span className="opacity-60">· 2–3 days</span>
                    </div>

                    <ol className="mt-5 flex flex-col gap-4">
                      {[
                        {
                          title: "Order received",
                          sub: "Booked by Dhaka Textiles",
                          done: true,
                        },
                        {
                          title: "Picked up",
                          sub: "Pickup rider · Mirpur, Dhaka",
                          done: true,
                        },
                        {
                          title: "Out for delivery",
                          sub: "Chattogram · 2 stops ahead",
                          done: false,
                        },
                      ].map((step) => (
                        <li key={step.title} className="flex gap-3">
                          {step.done ? (
                            <CheckCircle2 className="text-chart-2 mt-0.5 size-5 shrink-0" />
                          ) : (
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                              <span className="bg-chart-4/20 ring-chart-4/40 size-3 animate-pulse rounded-full ring-4" />
                            </span>
                          )}
                          <div className="flex flex-1 items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">
                              {step.title}
                            </span>
                            <span className="text-xs">{step.sub}</span>
                          </div>
                          <span
                            className={`mt-0.5 text-[11px] font-medium ${
                              step.done ? "text-chart-2" : "text-chart-4"
                            }`}
                          >
                            {step.done ? "Completed" : "In transit"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* right — summary */}
                  <div className="bg-muted/40 flex flex-col gap-4 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Summary</h3>
                      <span className="text-muted-foreground font-mono text-xs">
                        #C-2048
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                        <Clock className="size-3.5" />
                        Estimated delivery
                      </span>
                      <span className="text-xs font-medium">
                        Tomorrow · 10–12 AM
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                        <HandCoins className="size-3.5" />
                        Cash on delivery
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        Tk 1,250
                      </span>
                    </div>

                    <div className="border-border/60 my-1 border-t" />

                    <div className="flex items-center gap-3">
                      <span className="from-chart-1 to-chart-4 flex size-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white">
                        RM
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          Rahman M.
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          Pickup rider · #R-1042
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* floating chips */}
              <div className="absolute -left-4 top-1/2 hidden -translate-y-1/2 items-center gap-2 rounded-xl border bg-card/90 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur xl:flex">
                <span className="bg-chart-2/10 text-chart-2 flex size-7 items-center justify-center rounded-lg">
                  <PackageCheck className="size-4" />
                </span>
                Picked up · 09:41
              </div>
              <div className="absolute -right-4 bottom-1/4 hidden items-center gap-2 rounded-xl border bg-card/90 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur xl:flex">
                <span className="bg-chart-3/10 text-chart-3 flex size-7 items-center justify-center rounded-lg">
                  <Banknote className="size-4" />
                </span>
                COD → balance
              </div>
            </div>
          </div>
        </section>

        {/* ── Features Grid ── */}
        <section className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionHeading
              eyebrow="Platform Features"
              title="Everything you need to manage deliveries"
              sub="From order creation to cash settlement — a complete delivery management system built for Bangladesh."
            />

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon, iconClass, title, desc }) => (
                <div
                  key={title}
                  className="bg-card group relative overflow-hidden rounded-xl border p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <div
                    aria-hidden
                    className="from-primary/5 absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                  />
                  <div
                    className={`mb-4 flex size-11 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${iconClass}`}
                  >
                    {icon}
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Delivery lifecycle ── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <SectionHeading
            eyebrow="The delivery journey"
            title="Watch every step, door to door"
            sub="Every parcel moves through a visible lifecycle — so you always know where your shipment is and what happens next."
          />

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {journey.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="group flex flex-col items-center text-center"
              >
                <div className="relative mb-5">
                  <div className="bg-card border-border/70 flex size-16 items-center justify-center rounded-2xl border p-3 shadow-sm transition-shadow group-hover:shadow-md">
                    <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                      <Icon className="size-5" />
                    </span>
                  </div>
                  <span className="text-primary-foreground ring-background absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold ring-4 ring-background">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Support & Security ── */}
        <section className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionHeading
              eyebrow="Help & security"
              title="Backed by docs and hardened accounts"
              sub="Learn the whole flow before you ship — and know who touched what once you do."
            />

            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-card rounded-xl border p-6 shadow-sm sm:p-8">
                <div className="bg-chart-2/10 text-chart-2 mb-4 flex size-11 items-center justify-center rounded-lg">
                  <LifeBuoy className="size-5" />
                </div>
                <h3 className="font-semibold">Support that answers</h3>
                <ul className="text-muted-foreground mt-3 flex flex-col gap-2.5 text-sm leading-relaxed">
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    In-app support tickets — admin replies land in your
                    dashboard
                  </li>
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Role-based guides for merchants, riders, and admins
                  </li>
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Public tracking page — share a link, no account needed
                  </li>
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href="/help" />}
                    nativeButton={false}
                  >
                    Open the help center
                  </Button>
                </div>
              </div>

              <div className="bg-card rounded-xl border p-6 shadow-sm sm:p-8">
                <div className="bg-chart-1/10 text-chart-1 mb-4 flex size-11 items-center justify-center rounded-lg">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="font-semibold">Security built in</h3>
                <ul className="text-muted-foreground mt-3 flex flex-col gap-2.5 text-sm leading-relaxed">
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Two-factor authentication (authenticator app + recovery
                    codes) — optional for merchants, enforced for admin teams
                  </li>
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Every role and API re-checks permissions server-side
                  </li>
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Full audit trail of admin actions with before/after diffs
                  </li>
                  <li className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                    Optional IP allowlisting for admin portals
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Delivery Fee Calculator ── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <SectionHeading
            eyebrow="Pricing"
            title="Calculate your delivery fee"
            sub="Choose your pickup and delivery cities to see live zone-based rates, then adjust weight and COD amount for an instant estimate. Final rates are set per merchant by our admin team."
          />
          <div className="mx-auto max-w-3xl">
            <DeliveryFeeCalculator defaultPricing={platformPricing} />
          </div>
          <p className="mt-5 text-center">
            <Link
              href="/rates"
              data-testid="rate-card-link"
              className="text-primary text-sm font-medium hover:underline"
            >
              View the full city-to-city rate card
            </Link>
          </p>
        </section>

        {/* ── How it works ── */}
        <section className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionHeading
              eyebrow="For merchants"
              title="Up and running in three steps"
            />

            <div className="grid gap-8 sm:grid-cols-3">
              {howItWorks.map(({ step, icon, desc }, i) => (
                <div
                  key={step}
                  className="bg-card rounded-xl border p-6 shadow-sm"
                >
                  <div className="relative mb-5">
                    <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
                      {icon}
                    </div>
                    <span className="text-primary-foreground ring-card absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold ring-4 ring-card">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-semibold">{step}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="to-chart-4/10 from-chart-1/10 relative overflow-hidden rounded-3xl border bg-gradient-to-br via-transparent px-6 py-16 text-center sm:px-16">
            <div
              aria-hidden
              className="bg-chart-2/10 absolute -top-16 -right-16 size-52 rounded-full blur-3xl"
            />
            <div
              aria-hidden
              className="bg-chart-4/10 absolute -bottom-16 -left-16 size-52 rounded-full blur-3xl"
            />
            <div className="relative">
              <div className="text-muted-foreground/80 mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <Warehouse className="text-primary size-3.5" />
                From pickup location to doorstep
              </div>
              <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Ready to start shipping?
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-relaxed text-pretty">
                Join {siteConfig.name} today. Merchant accounts are approved
                within one business day.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="gap-2"
                  render={<Link href="/register" />}
                  nativeButton={false}
                >
                  Create merchant account
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  render={<Link href="/apply/rider" />}
                  nativeButton={false}
                >
                  <Bike className="size-4" />
                  Apply as a rider
                </Button>
              </div>
              <p className="text-muted-foreground mt-6 text-xs">
                Questions first?{" "}
                <Link href="/help" className="text-primary hover:underline">
                  Browse the guides
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
