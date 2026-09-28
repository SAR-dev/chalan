import { asc, eq } from "drizzle-orm"
import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import Link from "next/link"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { siteConfig } from "@/config/site"
import { dbRead } from "@/lib/db"
import { deliveryCity, deliveryZone, zonePricing } from "@/lib/db/schema"
import { formatTk } from "@/lib/pricing"

export const metadata: Metadata = {
  title: "Delivery Pricing",
  description: `${siteConfig.name} city-to-city delivery rates at a glance — pick your pickup and destination city to see the starting delivery fee for every route.`,
  alternates: { canonical: "/rates" },
  openGraph: {
    title: `Delivery Pricing – ${siteConfig.name}`,
    description: `${siteConfig.name} city-to-city delivery rates at a glance.`,
    url: "/rates",
  },
}

// Public rate-card data is cached like the landing page's platform config:
// zone-based prices only change when an admin edits them, so 5-minute reuse is
// plenty for a public page.
const getRateCard = unstable_cache(
  async () => {
    const [zones, cities, pricing] = await Promise.all([
      dbRead
        .select({ id: deliveryZone.id, name: deliveryZone.name })
        .from(deliveryZone)
        .where(eq(deliveryZone.isActive, true))
        .orderBy(asc(deliveryZone.name)),
      dbRead
        .select({
          id: deliveryCity.id,
          name: deliveryCity.name,
          zoneId: deliveryCity.zoneId,
        })
        .from(deliveryCity)
        .where(eq(deliveryCity.isActive, true))
        .orderBy(asc(deliveryCity.name)),
      dbRead
        .select({
          fromZoneId: zonePricing.fromZoneId,
          toZoneId: zonePricing.toZoneId,
          baseRate: zonePricing.baseRate,
          extraRatePerKg: zonePricing.extraRatePerKg,
          freeWeightKg: zonePricing.freeWeightKg,
          maxWeightKg: zonePricing.maxWeightKg,
        })
        .from(zonePricing)
        .orderBy(asc(zonePricing.fromZoneId), asc(zonePricing.toZoneId)),
    ])
    return { zones, cities, pricing }
  },
  ["public-rate-card"],
  { revalidate: 300 },
)

export default async function PricingPage() {
  const { zones, cities, pricing } = await getRateCard()

  // One rate per (origin zone, destination zone) pair.
  const rateFor = new Map(
    pricing.map((p) => [`${p.fromZoneId}:${p.toZoneId}`, p]),
  )
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name

  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      <PublicHeader />

      <main id="main-content" className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-primary text-xs font-semibold tracking-widest uppercase">
            Delivery pricing
          </p>
          <h1
            data-testid="pricing-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          >
            City-to-city rates at a glance
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed text-pretty">
            The starting delivery fee between any two service areas. Pick a city
            from the rows (pickup) and the columns (destination) — each cell is
            the base rate for that route. Final charges depend on parcel weight
            and each merchant&apos;s rate card.
          </p>
        </div>

        <Card>
          <CardHeader className="border-border border-b bg-muted/50">
            <CardTitle>Delivery fee matrix</CardTitle>
            <CardDescription>
              Starting delivery fee (Tk) from each pickup city to each
              destination city.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {cities.length === 0 ? (
              <p className="text-muted-foreground px-6 py-10 text-center text-sm">
                No delivery routes have been published yet — check back soon.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  data-testid="pricing-table"
                  className="w-full min-w-[720px] border-collapse text-sm"
                >
                  <thead>
                    <tr className="border-border/60 border-b bg-muted/30">
                      <th
                        scope="col"
                        className="text-muted-foreground sticky left-0 z-30 border-r border-border/60 bg-muted/30 px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase"
                      >
                        Pickup ↓ / Destination →
                      </th>
                      {cities.map((to) => (
                        <th
                          key={to.id}
                          scope="col"
                          className="text-muted-foreground px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap uppercase"
                        >
                          {to.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cities.map((from) => (
                      <tr
                        key={from.id}
                        className="border-border/40 border-b last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="bg-card sticky left-0 z-10 border-r border-border/60 px-4 py-2.5 text-left font-medium whitespace-nowrap"
                        >
                          {from.name}
                        </th>
                        {cities.map((to) => {
                          const row = rateFor.get(`${from.zoneId}:${to.zoneId}`)
                          return (
                            <td
                              key={to.id}
                              className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums"
                              title={
                                row
                                  ? `First ${row.freeWeightKg} kg free, then ${formatTk(row.extraRatePerKg)} per extra kg, up to ${row.maxWeightKg} kg`
                                  : undefined
                              }
                            >
                              {row ? formatTk(row.baseRate) : "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-muted-foreground mt-6 grid gap-2 text-xs leading-relaxed sm:grid-cols-3">
          <p>
            <span className="text-foreground font-medium">Base rate.</span> Each
            cell shows the price that covers the first free-weight kilograms.
          </p>
          <p>
            <span className="text-foreground font-medium">Extra weight.</span>{" "}
            Above the free allowance, weight is billed per kilogram and rounded
            up.
          </p>
          <p>
            <span className="text-foreground font-medium">Zones.</span> Rates
            are set per zone, so cities in the same zone share a price
            {cities[0] && zones.length > 0
              ? ` — e.g. “${zoneName(cities[0].zoneId)}”`
              : ""}
            .
          </p>
        </div>

        <div className="mt-12 text-center">
          <Button
            size="lg"
            className="gap-2"
            render={<Link href="/landing" />}
            nativeButton={false}
          >
            Estimate a delivery fee
            <ArrowRight className="size-4" />
          </Button>
          <p className="text-muted-foreground mt-3 text-xs">
            Use the calculator on the home page to factor in weight and COD.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
