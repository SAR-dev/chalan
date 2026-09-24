"use client"

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"

export default function OnboardingWelcomePage() {
  const { currentMerchant } = useMerchants()
  const { mutate } = useSWRConfig()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSkip() {
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
      // Revalidate merchant data so the shell guard sees the updated onboardingCompletedAt
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
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full">
          <CheckCircle2 className="size-6" />
        </div>
        <CardTitle className="text-2xl">
          Welcome to {currentMerchant?.businessName ?? "Kikuya"}!
        </CardTitle>
        <CardDescription className="leading-relaxed text-pretty">
          Your account is active and ready. Let&apos;s set up your first pickup
          location so you can start creating orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-medium">Quick setup checklist</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-primary size-4" />
              <span>Email verified</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-primary size-4" />
              <span>Account activated</span>
            </li>
            <li className="text-muted-foreground flex items-center gap-2">
              <div className="border-muted-foreground size-4 rounded-full border" />
              <span>Add pickup location</span>
            </li>
            <li className="text-muted-foreground flex items-center gap-2">
              <div className="border-muted-foreground size-4 rounded-full border" />
              <span>View pricing</span>
            </li>
          </ul>
        </div>

        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        <Button
          render={<Link href="/pickup-locations" />}
          nativeButton={false}
          className="w-full"
        >
          Get Started
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleSkip}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Skipping...
            </>
          ) : (
            "Skip for now"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
