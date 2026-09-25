import {
  ArrowRight,
  Banknote,
  Bike,
  Building2,
  Check,
  FileText,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Package,
  ShieldCheck,
  Star,
  Truck,
  Users,
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
import { platformConfig } from "@/lib/db/schema"

const DEFAULT_PRICING = {
  baseRate: 60,
  extraRatePerKg: 10,
  freeWeightKg: 1,
  maxWeightKg: 10,
  codFeePercentage: 1,
}

// Cache platform config for 5 minutes — this page is heavily fetched
// and the config rarely changes (set by admin in Settings).
// Falls back to defaults when DB is unavailable (e.g. during build).
const getCachedPlatformConfig = unstable_cache(
  async () => {
    try {
      const config = await dbRead
        .select({
          defaultBaseRate: platformConfig.defaultBaseRate,
          defaultExtraRatePerKg: platformConfig.defaultExtraRatePerKg,
          defaultFreeWeightKg: platformConfig.defaultFreeWeightKg,
          defaultMaxWeightKg: platformConfig.defaultMaxWeightKg,
          defaultCodFeePercentage: platformConfig.defaultCodFeePercentage,
        })
        .from(platformConfig)
        .limit(1)
        .then((r) => r[0])

      return {
        baseRate: config?.defaultBaseRate ?? DEFAULT_PRICING.baseRate,
        extraRatePerKg:
          config?.defaultExtraRatePerKg ?? DEFAULT_PRICING.extraRatePerKg,
        freeWeightKg:
          config?.defaultFreeWeightKg ?? DEFAULT_PRICING.freeWeightKg,
        maxWeightKg: config?.defaultMaxWeightKg ?? DEFAULT_PRICING.maxWeightKg,
        codFeePercentage:
          config?.defaultCodFeePercentage ?? DEFAULT_PRICING.codFeePercentage,
      }
    } catch {
      return DEFAULT_PRICING
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
    desc: "Intake queue, dispatch desk, and COD reconciliation — warehouse admins manage the full flow.",
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
    title: "Help Center & FAQ",
    desc: "Step-by-step guides for merchants, riders, and admins, plus a full FAQ — reachable from every page.",
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
                render={<Link href="/faq" />}
                nativeButton={false}
              >
                FAQ
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

      <main>
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

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
            <Link
              href="/help"
              className="border-border bg-background hover:border-primary/40 mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            >
              <LifeBuoy className="text-primary size-3.5" />
              New: Help center, FAQ &amp; in-app ticket support
              <ArrowRight className="text-muted-foreground size-3" />
            </Link>

            <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Ship anything.
              <br />
              <span className="text-primary">Track everything.</span>
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
                  <Check className="text-primary size-3.5" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Grid ── */}
        <section className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-12 text-center">
              <p className="text-primary text-xs font-semibold tracking-widest uppercase">
                Platform Features
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                Everything you need to manage deliveries
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
                From order creation to cash settlement — a complete delivery
                management system built for Bangladesh.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon, iconClass, title, desc }) => (
                <div
                  key={title}
                  className="bg-background rounded-xl border p-6 transition-colors hover:border-primary/30"
                >
                  <div
                    className={`mb-4 flex size-10 items-center justify-center rounded-lg ${iconClass}`}
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

        {/* ── Support & Security ── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              Help &amp; security
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Backed by docs and hardened accounts
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
              Learn the whole flow before you ship — and know who touched what
              once you do.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-background rounded-xl border p-6 sm:p-8">
              <div className="bg-chart-2/10 text-chart-2 mb-4 flex size-10 items-center justify-center rounded-lg">
                <LifeBuoy className="size-5" />
              </div>
              <h3 className="font-semibold">Support that answers</h3>
              <ul className="text-muted-foreground mt-3 flex flex-col gap-2 text-sm leading-relaxed">
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  In-app support tickets — admin replies land in your dashboard
                </li>
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  Role-based guides for merchants, riders, and admins
                </li>
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  30-question FAQ covering orders, COD, pricing, and returns
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
                  render={<Link href="/faq" />}
                  nativeButton={false}
                >
                  Browse the FAQ
                </Button>
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

            <div className="bg-background rounded-xl border p-6 sm:p-8">
              <div className="bg-chart-1/10 text-chart-1 mb-4 flex size-10 items-center justify-center rounded-lg">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="font-semibold">Security built in</h3>
              <ul className="text-muted-foreground mt-3 flex flex-col gap-2 text-sm leading-relaxed">
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  Two-factor authentication (authenticator app + recovery codes)
                  — optional for merchants, enforced for admin teams
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
              <div className="mt-5">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/faq" />}
                  nativeButton={false}
                >
                  Security questions in the FAQ
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Delivery Fee Calculator ── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              Pricing
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Calculate your delivery fee
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
              Enter your parcel weight and COD amount to see an instant
              estimate. Final rates are set per merchant by our admin team.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <DeliveryFeeCalculator defaultPricing={platformPricing} />
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              For merchants
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Up and running in three steps
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {howItWorks.map(({ step, icon, desc }, i) => (
              <div key={step} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                    {icon}
                  </div>
                  <span className="text-muted-foreground text-sm font-medium">
                    Step {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold">{step}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to start shipping?
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-relaxed">
            Join {siteConfig.name} today. Merchant accounts are approved within
            one business day.
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
            <Link href="/faq" className="text-primary hover:underline">
              Read the FAQ
            </Link>{" "}
            or{" "}
            <Link href="/help" className="text-primary hover:underline">
              browse the guides
            </Link>
            .
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
