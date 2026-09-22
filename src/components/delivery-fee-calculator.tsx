"use client"

import { Calculator, Info } from "lucide-react"
import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { calcCodFee, calcDeliveryCharge, formatTk } from "@/lib/pricing"

interface DefaultPricing {
  baseRate: number
  extraRatePerKg: number
  freeWeightKg: number
  maxWeightKg: number
  codFeePercentage: number
}

export function DeliveryFeeCalculator({
  defaultPricing,
}: {
  defaultPricing: DefaultPricing
}) {
  const [weight, setWeight] = useState("1")
  const [codAmount, setCodAmount] = useState("500")

  const weightNum = Math.max(0, Number(weight) || 0)
  const codNum = Math.max(0, Number(codAmount) || 0)

  const breakdown = useMemo(
    () =>
      calcDeliveryCharge(
        {
          baseRate: defaultPricing.baseRate,
          extraRatePerKg: defaultPricing.extraRatePerKg,
          freeWeightKg: defaultPricing.freeWeightKg,
          maxWeightKg: defaultPricing.maxWeightKg,
        },
        weightNum,
      ),
    [defaultPricing, weightNum],
  )

  const codFee = useMemo(
    () => calcCodFee(codNum, defaultPricing.codFeePercentage),
    [codNum, defaultPricing.codFeePercentage],
  )

  const merchantEarnings = Math.max(0, codNum - breakdown.total - codFee)

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted/50 border-border border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Calculator className="text-primary size-5" />
          <h3 className="font-semibold">Delivery Fee Calculator</h3>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Estimate your delivery cost based on parcel weight and COD amount.
        </p>
      </div>
      <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
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
              Free up to {defaultPricing.freeWeightKg} KG. Max{" "}
              {defaultPricing.maxWeightKg} KG.
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
              Cash collected from recipient. COD fee:{" "}
              {defaultPricing.codFeePercentage}%.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Delivery fee
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {formatTk(breakdown.total)}
            </p>
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
                    {formatTk(defaultPricing.extraRatePerKg)})
                  </span>
                  <span className="tabular-nums">
                    {formatTk(breakdown.extraWeightCharge)}
                  </span>
                </div>
              )}
            </div>
            {breakdown.exceedsMax && (
              <p className="text-destructive mt-2 text-xs font-medium">
                Exceeds maximum {defaultPricing.maxWeightKg} KG weight limit.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              COD fee ({defaultPricing.codFeePercentage}%)
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatTk(codFee)}
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
      </CardContent>
    </Card>
  )
}
