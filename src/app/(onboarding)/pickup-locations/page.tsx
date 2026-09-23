"use client"

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { pickupLocationSchema, validateFormData } from "@/lib/validation"

export default function OnboardingPickupLocationsPage() {
  const router = useRouter()
  const { cities, isLoading: citiesLoading } = useDeliveryCities()
  const [form, setForm] = useState({
    label: "",
    address: "",
    cityId: "",
    mapLink: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const fieldErrors = validateFormData(pickupLocationSchema, {
      label: form.label.trim(),
      address: form.address.trim(),
      cityId: form.cityId,
      mapLink: form.mapLink || undefined,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)

    try {
      const res = await fetch("/api/pickup-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim(),
          address: form.address.trim(),
          cityId: form.cityId,
          mapLink: form.mapLink || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(
          data?.error ?? "Could not add pickup location. Please try again.",
        )
        return
      }
      router.push("/pricing")
    } catch {
      setError("Could not add pickup location. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/merchants/me/onboarding", {
        method: "PATCH",
      })
      if (!res.ok) {
        setError("Could not complete setup. Please try again.")
        return
      }
      window.location.href = "/merchant"
    } catch {
      setError("Could not complete setup. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Add a pickup location</CardTitle>
        <CardDescription className="leading-relaxed text-pretty">
          This is where riders will pick up your parcels. You can add more
          locations later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Shop / location name</Label>
            <Input
              id="label"
              placeholder="e.g. Main Warehouse"
              value={form.label}
              onChange={(e) => update("label", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="House 14, Road 7, Dhanmondi, Dhaka"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cityId">City</Label>
            <select
              id="cityId"
              value={form.cityId}
              onChange={(e) => update("cityId", e.target.value)}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              required
            >
              <option value="">
                {citiesLoading ? "Loading cities..." : "Select a city"}
              </option>
              {cities?.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mapLink">
              Map link <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="mapLink"
              type="url"
              placeholder="https://maps.google.com/..."
              value={form.mapLink}
              onChange={(e) => update("mapLink", e.target.value)}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSkip}
            disabled={submitting}
          >
            Skip for now
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            render={<Link href="/welcome" />}
            nativeButton={false}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
