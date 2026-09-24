"use client"

import { AlertTriangle, Calculator, Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatTk } from "@/lib/pricing"

interface BatchSummaryCardProps {
  parcelCount: number
  anyExceeds: boolean
  maxWeightKg: number
  totals: {
    productCost: number
    deliveryCharge: number
    codFee: number
  }
  submitting: boolean
}

export function BatchSummaryCard({
  parcelCount,
  anyExceeds,
  maxWeightKg,
  totals,
  submitting,
}: BatchSummaryCardProps) {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4" />
          Batch summary
        </CardTitle>
        <CardDescription>
          {parcelCount} parcel{parcelCount > 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {anyExceeds && (
          <div className="bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-md px-3 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Some parcels exceed the {maxWeightKg} KG maximum. Fix them before
              submitting.
            </span>
          </div>
        )}
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total COD</dt>
            <dd className="font-medium tabular-nums">
              {formatTk(totals.productCost)}
            </dd>
          </div>
          {totals.codFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total COD Charge</dt>
              <dd className="font-medium tabular-nums">
                {formatTk(totals.codFee)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total Delivery Charge</dt>
            <dd className="font-medium tabular-nums">
              {formatTk(totals.deliveryCharge)}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Cash collected from recipient on delivery. Delivery fees are charged
          to your platform balance.
        </p>
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          form="order-form"
          className="w-full"
          disabled={submitting || anyExceeds}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating
            </>
          ) : (
            <>
              <PackageCheck className="size-4" />
              Confirm {parcelCount} order
              {parcelCount > 1 ? "s" : ""}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
