"use client"

import {
  CheckCircle2,
  Clock,
  Info,
  MapPinned,
  Package,
  Scale,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DeliveryFeeCalculator } from "@/components/delivery-fee-calculator"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { RequestPackageDialog } from "@/features/packages/dialogs/request-package-dialog"
import {
  type PackageRow,
  usePackages,
} from "@/features/packages/hooks/use-packages"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { usePlatformPricingPublic } from "@/features/platform-config/hooks/use-platform-pricing-public"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { formatTk } from "@/lib/pricing"

function TierList({ pkg }: { pkg: PackageRow }) {
  if (pkg.tiers.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No discount tiers configured for this package yet.
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {pkg.tiers.map((t) => (
        <li key={t.id} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            From {t.orderCount} orders
          </span>
          <span className="font-medium">
            {t.ruleType === "FLAT"
              ? `${formatTk(t.ruleValue)} delivery`
              : `${t.ruleValue}% off delivery`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function MerchantPricingPage() {
  const { currentMerchant } = useMerchants()
  const { packages, activePackage, latestRequest, isLoading } = usePackages()
  const { platformDefaults } = usePlatformPricingPublic()
  const { zones } = useDeliveryZones()
  const { pricing: zoneRates } = useZonePricingPublic()

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id
  const [requesting, setRequesting] = useState<PackageRow | null>(null)

  if (!currentMerchant) return null
  const m = currentMerchant

  const activePkg = activePackage
    ? packages.find((p) => p.id === activePackage.packageId)
    : undefined

  // A settled (approved/rejected) request is history, not a block — only a
  // pending one or an active bundle stops a new purchase.
  const pendingRequest =
    latestRequest?.status === "PENDING" ? latestRequest : null
  const blocked = Boolean(activePackage) || Boolean(pendingRequest)

  // Progress toward the next unlocked tier on the active bundle.
  const used = activePackage?.ordersUsed ?? 0
  const nextTier = activePkg?.tiers.find((t) => t.orderCount > used)
  const prevTier = [...(activePkg?.tiers ?? [])]
    .reverse()
    .find((t) => t.orderCount <= used)

  let progressPct: number | null = null
  if (activePackage && nextTier) {
    const from = prevTier?.orderCount ?? 0
    const span = nextTier.orderCount - from
    progressPct =
      span > 0 ? Math.min(100, Math.round(((used - from) / span) * 100)) : 100
  }

  return (
    <>
      <PageHeader
        title={pageContent.merchant.pricing.title}
        description={pageContent.merchant.pricing.description}
      />

      {/* Active bundle */}
      {activePackage ? (
        <Card
          className="border-primary/40 mb-6"
          data-testid="merchant-active-package"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="text-primary size-5" />
              {activePkg?.name ?? "Your package"}
            </CardTitle>
            <CardDescription>
              Active bundle — discount applies as you ship orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">Orders used</p>
                <p
                  className="text-lg font-semibold tabular-nums"
                  data-testid="merchant-package-orders-used"
                >
                  {activePackage.ordersUsed}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Started</p>
                <p className="text-sm font-medium">
                  {new Date(activePackage.startedAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Price paid</p>
                <p className="text-sm font-medium">
                  {latestRequest?.status === "APPROVED"
                    ? formatTk(Number(latestRequest.amount))
                    : "—"}
                </p>
              </div>
            </div>

            {nextTier ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {nextTier.orderCount - (activePackage.ordersUsed ?? 0)} more
                    order
                    {nextTier.orderCount - (activePackage.ordersUsed ?? 0) === 1
                      ? ""
                      : "s"}{" "}
                    to unlock
                  </span>
                  <span className="font-medium">
                    {nextTier.ruleType === "FLAT"
                      ? `${formatTk(nextTier.ruleValue)} delivery`
                      : `${nextTier.ruleValue}% off delivery`}
                  </span>
                </div>
                {progressPct !== null && (
                  <Progress
                    value={progressPct}
                    data-testid="merchant-package-progress"
                  />
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Every tier on this package is unlocked.
              </p>
            )}

            <p className="text-muted-foreground text-xs">
              You can request another package once this bundle is used up.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Pending / rejected request */}
      {latestRequest?.status === "PENDING" ? (
        <Card
          className="border-chart-3/40 mb-6"
          data-testid="merchant-package-pending"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="text-chart-3 size-5" />
              Request awaiting review
            </CardTitle>
            <CardDescription>
              {formatTk(Number(latestRequest.amount))} — an admin will confirm
              your payment before the bundle activates.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {latestRequest?.status === "REJECTED" ? (
        <Card
          className="border-destructive/40 mb-6"
          data-testid="merchant-package-rejected"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="text-destructive size-5" />
              Request declined
            </CardTitle>
            <CardDescription>
              {latestRequest.rejectReason ?? "The admin declined this request."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* Catalogue */}
      <h2 className="mb-3 text-lg font-semibold">Prepaid packages</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Paying by manual transfer?{" "}
        <Link
          href="/merchant/finance?tab=wallet"
          data-testid="pricing-top-up-link"
          className="text-primary hover:underline"
        >
          Top up your wallet
        </Link>{" "}
        first — approved top-ups become credit you can spend on orders and
        packages.
      </p>
      {isLoading ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Loading packages…
          </CardContent>
        </Card>
      ) : packages.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No packages are available right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} data-testid={`package-card-${pkg.id}`}>
              <CardHeader>
                <CardTitle className="text-base">{pkg.name}</CardTitle>
                {pkg.description ? (
                  <CardDescription>{pkg.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatTk(Number(pkg.price))}
                </p>
                <TierList pkg={pkg} />
                <Button
                  className="w-full"
                  disabled={blocked}
                  data-testid={`package-request-${pkg.id}`}
                  onClick={() => setRequesting(pkg)}
                >
                  {activePackage
                    ? "Bundle already active"
                    : pendingRequest
                      ? "Request already submitted"
                      : "Request package"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Fee estimator, pre-loaded with the merchant's active bundle tier so the
          preview matches what order creation actually charges. */}
      {platformDefaults ? (
        <div className="mt-8" data-testid="merchant-fee-calculator">
          <DeliveryFeeCalculator
            defaultPricing={platformDefaults}
            packageRule={prevTier ?? null}
          />
        </div>
      ) : null}

      {zoneRates.length > 0 ? (
        <Card className="mt-8" data-testid="merchant-zone-rate-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="size-4" />
              Zone rate card
            </CardTitle>
            <CardDescription>
              Delivery rates by origin and destination zone. A route with no row
              here falls back to the platform defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Route</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Base rate
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Extra / KG
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Free</th>
                    <th className="px-4 py-2 text-right font-medium">COD</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneRates.map((r) => (
                    <tr
                      key={r.id}
                      className="border-border border-t"
                      data-testid={`zone-rate-${r.id}`}
                    >
                      <td className="px-4 py-2">
                        {zoneName(r.fromZoneId)} → {zoneName(r.toZoneId)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatTk(r.baseRate)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatTk(r.extraRatePerKg)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.freeWeightKg} KG
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.codFeePercentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="size-4" />
              Your weight limit
            </CardTitle>
            <CardDescription>
              Set by the platform for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground text-sm">
                Max parcel weight
              </span>
              <span className="text-sm font-medium tabular-nums">
                {m.maxWeightKg} KG
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Parcels above this weight cannot be booked. Contact an admin to
              request a change.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-4" />
              How charges work
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-sm">
            <p>
              <strong className="text-foreground">Delivery fees</strong> are set
              per route (pickup zone → destination zone) by the platform and
              shown live as you create an order.
            </p>
            <p>
              <strong className="text-foreground">Packages</strong> discount
              that route fee as you ship more orders. A flat package price
              replaces the route fee; a percentage package reduces it.
            </p>
            <p>
              <strong className="text-foreground">COD fee</strong> is a
              percentage of the cash collected from the recipient, deducted from
              your balance alongside the delivery charge.
            </p>
            <p className="flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="size-3.5" />A cancelled or returned order
              returns its package quota.
            </p>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/rates" />}
              nativeButton={false}
            >
              View the rate card
            </Button>
          </CardContent>
        </Card>
      </div>

      {requesting ? (
        <RequestPackageDialog
          pkg={requesting}
          open
          onOpenChange={(o) => !o && setRequesting(null)}
        />
      ) : null}
    </>
  )
}
