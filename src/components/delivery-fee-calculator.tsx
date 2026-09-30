"use client"

import { Calculator, Info, Loader2, MapPinned, Route } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { applyPackageRule, type PackageRule } from "@/lib/packages"
import { calcCodFee, calcDeliveryCharge, formatTk } from "@/lib/pricing"

interface DefaultPricing {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
  cancellationFee: number
}

interface DeliveryCity {
  id: string
  name: string
  zoneId: string | null
}

interface ZonePricingRow {
  id: string
  fromZoneId: string
  toZoneId: string
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
  cancellationFee: number
}

/**
 * Public fee estimator. Uses the live zone-pricing matrix fetched from the
 * public APIs (/api/delivery-cities + /api/zone-pricing) so visitors see the
 * real route-based rates.
 *
 * `defaultPricing` is a SAMPLE rate: there is no platform-wide rate any more,
 * so it only covers the pre-hydration state and a failed fetch. Once the matrix
 * has loaded, a route with no `zone_pricing` row is reported as unpriced rather
 * than estimated — quoting a number would promise a rate order creation would
 * reject.
 *
 * `packageRule` is the merchant's active bundle tier, when signed in with one:
 * it discounts the delivery fee through the same `applyPackageRule` helper the
 * server charges with, so the estimate matches the real charge.
 */
export function DeliveryFeeCalculator({
  defaultPricing,
  packageRule = null,
}: {
  defaultPricing: DefaultPricing
  packageRule?: PackageRule | null
}) {
  const [weight, setWeight] = useState("1")
  const [codAmount, setCodAmount] = useState("500")
  const [cities, setCities] = useState<DeliveryCity[]>([])
  const [pricingRows, setPricingRows] = useState<ZonePricingRow[]>([])
  const [fromCityId, setFromCityId] = useState("")
  const [toCityId, setToCityId] = useState("")
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [citiesRes, pricingRes] = await Promise.all([
          fetch("/api/delivery-cities"),
          fetch("/api/zone-pricing"),
        ])
        if (!citiesRes.ok || !pricingRes.ok)
          throw new Error("rates unavailable")
        const [cityData, pricingData]: [DeliveryCity[], ZonePricingRow[]] =
          await Promise.all([citiesRes.json(), pricingRes.json()])
        if (cancelled) return

        setCities(cityData)
        setPricingRows(pricingData)
        if (cityData.length >= 2) {
          setFromCityId((prev) => prev || cityData[0].id)
          setToCityId((prev) => prev || cityData[1].id)
        } else if (cityData.length === 1) {
          setFromCityId((prev) => prev || cityData[0].id)
          setToCityId((prev) => prev || cityData[0].id)
        }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const weightNum = Math.max(0, Number(weight) || 0)
  const codNum = Math.max(0, Number(codAmount) || 0)

  const fromCity = cities.find((c) => c.id === fromCityId)
  const toCity = cities.find((c) => c.id === toCityId)
  const zoneRow =
    fromCity?.zoneId && toCity?.zoneId
      ? pricingRows.find(
          (p) =>
            p.fromZoneId === fromCity.zoneId && p.toZoneId === toCity.zoneId,
        )
      : undefined

  // The rate this estimate is built from.
  //
  // Before the matrix has loaded there is nothing to check the chosen lane
  // against, so a sample rate keeps the estimator usable rather than blank.
  // Once loaded, a lane with no row has NO price — quoting a number would
  // promise a rate the order form would reject.
  const effective: DefaultPricing | null =
    zoneRow ?? (loading || failed ? defaultPricing : null)

  // Null-safe stand-in so the JSX can branch on `effective` without every
  // derived memo having to handle `null` itself. Never rendered.
  const rate: DefaultPricing = effective ?? {
    baseRate: 0,
    extraRatePerKg: 0,
    freeWeightKg: 0,
    maxWeightKg: 0,
    codFeePercentage: 0,
    cancellationFee: 0,
  }

  const breakdown = useMemo(
    () =>
      calcDeliveryCharge(
        {
          baseRate: rate.baseRate,
          extraRatePerKg: rate.extraRatePerKg,
          freeWeightKg: rate.freeWeightKg,
          maxWeightKg: rate.maxWeightKg,
        },
        weightNum,
      ),
    [rate, weightNum],
  )

  const codFee = useMemo(
    () => calcCodFee(codNum, rate.codFeePercentage),
    [codNum, rate.codFeePercentage],
  )

  // The bundle discount applies to the delivery fee only (COD and cancellation
  // fees are unchanged), matching what order creation charges.
  const deliveryFee = useMemo(
    () => applyPackageRule(breakdown.total, packageRule),
    [breakdown.total, packageRule],
  )
  const bundleDiscount = breakdown.total - deliveryFee

  const merchantEarnings = Math.max(0, codNum - deliveryFee - codFee)

  const sourceBadge = loading ? (
    <span className="text-muted-foreground inline-flex items-center gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      Loading live rates…
    </span>
  ) : failed ? (
    <span className="text-muted-foreground inline-flex items-center gap-1.5">
      <Info className="size-3" />
      Live rates unavailable — sample estimate only
    </span>
  ) : zoneRow ? (
    <span className="bg-chart-2/10 text-chart-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
      <Route className="size-3" />
      Zone-based rates
    </span>
  ) : (
    <span className="text-destructive/80 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium">
      <Info className="size-3" />
      Not priced for this route
    </span>
  )

  const fromName = fromCity?.name ?? ""
  const toName = toCity?.name ?? ""

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted/50 border-border border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Calculator className="text-primary size-5" />
          <h3 className="font-semibold">Delivery Fee Calculator</h3>
          <div className="ml-auto hidden sm:block">{sourceBadge}</div>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick your pickup and delivery cities for a real zone-based estimate —
          weighted by parcel size and COD amount.
        </p>
        <div className="mt-2 sm:hidden">{sourceBadge}</div>
      </div>

      <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="calc-from">Pickup city</Label>
              <Select
                value={fromCityId}
                onValueChange={(v) => setFromCityId(v ?? "")}
              >
                <SelectTrigger id="calc-from" className="w-full">
                  <SelectValue placeholder="Select pickup city">
                    {fromName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="calc-to">Delivery city</Label>
              <Select
                value={toCityId}
                onValueChange={(v) => setToCityId(v ?? "")}
              >
                <SelectTrigger id="calc-to" className="w-full">
                  <SelectValue placeholder="Select delivery city">
                    {toName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!loading && !failed && fromCity && toCity && !zoneRow ? (
            <p
              className="text-destructive flex items-center gap-1.5 text-xs"
              data-testid="calc-route-unpriced"
            >
              <Route className="size-3.5" />
              No pricing configured for {fromCity.name} → {toCity.name}. There
              is no rate for this route yet.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="calc-weight">Parcel weight (KG)</Label>
            <Input
              id="calc-weight"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="1"
            />
            <p className="text-muted-foreground text-xs">
              {effective
                ? `Free up to ${rate.freeWeightKg} KG. Max ${rate.maxWeightKg} KG.`
                : "Weighted against this route's rate once one is configured."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="calc-cod">COD amount (TK)</Label>
            <Input
              id="calc-cod"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={codAmount}
              onChange={(e) => setCodAmount(e.target.value)}
              placeholder="500"
            />
            <p className="text-muted-foreground text-xs">
              Cash collected from recipient.
              {effective ? ` COD fee: ${rate.codFeePercentage}%.` : ""}
            </p>
          </div>

          {zoneRow && !loading ? (
            <div className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border p-3 text-xs">
              <MapPinned className="text-primary size-4 shrink-0" />
              <span className="text-muted-foreground">
                {fromName} → {toName} uses the{" "}
                <span className="text-foreground font-medium">
                  zone rate card
                </span>{" "}
                for this route.
              </span>
            </div>
          ) : null}
        </div>

        {effective === null ? (
          // The matrix has loaded and this lane has no row: there is no price
          // to show, because order creation would reject it too.
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            data-testid="calc-unpriced"
          >
            <Route className="text-destructive mx-auto mb-2 size-5" />
            <p className="text-sm font-medium">
              No price for {fromName} → {toName}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              This route has no configured rate, so an order cannot be placed on
              it either. Pick another route, or ask an admin to add this one to
              the zone rate card.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Delivery fee
              </p>
              <p
                className="text-2xl font-bold tabular-nums"
                data-testid="calc-delivery-fee"
              >
                {formatTk(deliveryFee)}
              </p>
              {bundleDiscount > 0 && (
                <p
                  className="text-chart-2 mt-1 text-xs font-medium"
                  data-testid="calc-bundle-discount"
                >
                  Bundle discount −{formatTk(bundleDiscount)} (was{" "}
                  {formatTk(breakdown.total)})
                </p>
              )}
              <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Base rate</span>
                  <span className="tabular-nums">
                    {formatTk(breakdown.baseRate)}
                  </span>
                </div>
                {breakdown.billableExtraKg > 0 && (
                  <div className="flex justify-between">
                    <span>
                      Extra weight ({breakdown.billableExtraKg} KG ×{" "}
                      {formatTk(effective.extraRatePerKg)})
                    </span>
                    <span className="tabular-nums">
                      {formatTk(breakdown.extraWeightCharge)}
                    </span>
                  </div>
                )}
              </div>
              {breakdown.exceedsMax && (
                <p className="text-destructive mt-2 text-xs font-medium">
                  Exceeds maximum {effective.maxWeightKg} KG weight limit.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                COD fee ({effective.codFeePercentage}%)
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatTk(codFee)}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Cancellation fee
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatTk(effective.cancellationFee)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Charged only if the parcel is returned; the delivery and COD
                fees are refunded.
              </p>
            </div>

            <Separator />

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wide">
                  Merchant receives
                </p>
                <Info className="text-muted-foreground size-3" />
              </div>
              <p className="text-primary mt-1 text-2xl font-bold tabular-nums">
                {formatTk(merchantEarnings)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                COD amount − delivery fee − COD fee
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
