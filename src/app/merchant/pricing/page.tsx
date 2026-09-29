"use client"

import { Info, Scale } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"

export default function MerchantPricingPage() {
  const { currentMerchant } = useMerchants()
  if (!currentMerchant) return null
  const m = currentMerchant

  return (
    <>
      <PageHeader
        title={pageContent.merchant.pricing.title}
        description={pageContent.merchant.pricing.description}
      />

      <div className="grid gap-6 lg:grid-cols-2">
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
              <strong className="text-foreground">COD fee</strong> is a
              percentage of the cash collected from the recipient, deducted from
              your balance alongside the delivery charge.
            </p>
            <p>
              <strong className="text-foreground">Earnings</strong> per order ={" "}
              <span className="text-foreground font-medium">
                COD amount − delivery charge − COD fee
              </span>
              .
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
    </>
  )
}
