"use client"

import { Calculator, Info, Tag } from "lucide-react"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { calcCodFee, calcDeliveryCharge, formatTk } from "@/lib/pricing"

function RateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function MerchantPricingPage() {
  const { currentMerchant } = useMerchants()

  const [weight, setWeight] = useState("1")
  const [codAmount, setCodAmount] = useState("1000")

  const preview = useMemo(() => {
    if (!currentMerchant) return null
    const w = Number(weight) || 0
    const cod = Number(codAmount) || 0
    const delivery = calcDeliveryCharge(currentMerchant, w)
    const codFee = calcCodFee(cod, currentMerchant.codFeePercentage ?? 1)
    return { delivery, codFee, cod }
  }, [weight, codAmount, currentMerchant])

  if (!currentMerchant) return null

  const m = currentMerchant

  return (
    <>
      <PageHeader
        title={pageContent.merchant.pricing.title}
        description={pageContent.merchant.pricing.description}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="size-4" />
                Your delivery rates
              </CardTitle>
              <CardDescription>
                These rates are set by the platform for your account. Contact an
                admin to request changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-border divide-y py-0">
              <RateRow label="Base rate" value={formatTk(m.baseRate)} />
              <RateRow
                label="Extra per kg"
                value={`${formatTk(m.extraRatePerKg)} / KG`}
              />
              <RateRow label="Free weight" value={`${m.freeWeightKg} KG`} />
              <RateRow label="Max weight" value={`${m.maxWeightKg} KG`} />
              <RateRow
                label="COD fee"
                value={`${m.codFeePercentage ?? 1}% of COD amount`}
              />
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
                <strong className="text-foreground">Delivery charge</strong> is
                calculated per parcel: a base rate plus an extra per-kg fee for
                weight above the free allowance. Partial kg is rounded up.
              </p>
              <p>
                <strong className="text-foreground">COD fee</strong> is a
                percentage of the cash amount you collect from the recipient. It
                is deducted from your balance alongside the delivery charge.
              </p>
              <p>
                <strong className="text-foreground">Earnings</strong> per order
                ={" "}
                <span className="text-foreground font-medium">
                  COD amount − delivery charge − COD fee
                </span>
                . If the result is negative, your earnings for that order are 0.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="size-4" />
                Charge calculator
              </CardTitle>
              <CardDescription>
                Preview charges for a sample parcel.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="calc-cod">COD amount (TK)</Label>
                <Input
                  id="calc-cod"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value)}
                  placeholder="1000"
                />
              </div>

              {preview && (
                <>
                  <Separator />

                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Base rate</dt>
                      <dd className="font-medium tabular-nums">
                        {formatTk(preview.delivery.baseRate)}
                      </dd>
                    </div>
                    {preview.delivery.billableExtraKg > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Extra weight ({preview.delivery.billableExtraKg} KG)
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {formatTk(preview.delivery.extraWeightCharge)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 font-medium text-sm">
                      <dt>Delivery charge</dt>
                      <dd className="tabular-nums">
                        {formatTk(preview.delivery.total)}
                      </dd>
                    </div>
                  </dl>

                  <Separator />

                  <dl className="space-y-2 text-sm">
                    {preview.cod > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">COD amount</dt>
                        <dd className="font-medium tabular-nums">
                          {formatTk(preview.cod)}
                        </dd>
                      </div>
                    )}
                    {preview.codFee > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">COD fee</dt>
                        <dd className="font-medium tabular-nums">
                          {formatTk(preview.codFee)}
                        </dd>
                      </div>
                    )}
                    {preview.cod > 0 && (
                      <div className="flex justify-between pt-1 font-medium text-sm">
                        <dt>Your earnings</dt>
                        <dd className="tabular-nums">
                          {formatTk(
                            Math.max(
                              0,
                              preview.cod -
                                preview.delivery.total -
                                preview.codFee,
                            ),
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              )}

              {preview?.delivery.exceedsMax && (
                <p className="text-destructive text-xs">
                  This weight exceeds your {m.maxWeightKg} KG maximum and would
                  be rejected.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
