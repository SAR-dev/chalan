"use client"

import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function OnboardingPricingPage() {
  const { mutate } = useSWRConfig()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleComplete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/merchants/me/onboarding", {
        method: "PATCH",
      })
      if (!res.ok) {
        setError("Could not complete setup. Please try again.")
        return
      }
      await mutate((key: string) => key.startsWith("/api/merchants"))
      window.location.href = "/merchant"
    } catch {
      setError("Could not complete setup. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Delivery pricing</CardTitle>
        <CardDescription className="leading-relaxed text-pretty">
          Your delivery fees are calculated based on zones. Here&apos;s how it
          works.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-medium">How fees are calculated</h3>
          <p className="text-muted-foreground text-sm">
            Delivery fees depend on two zones: where your pickup location is and
            where the parcel is going. The platform uses a zone-to-zone pricing
            matrix to determine the fee for each delivery.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-medium">Weight limit</h3>
          <p className="text-muted-foreground text-sm">
            The maximum parcel weight is set per route by the platform,
            alongside that route&apos;s rates — so it can differ between
            destinations. The limit for your chosen pickup and delivery city is
            shown while you create an order.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        <Button className="w-full" onClick={handleComplete} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Completing...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Complete Setup
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          render={<Link href="/pickup-locations" />}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </CardContent>
    </Card>
  )
}
