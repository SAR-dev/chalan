"use client"

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  Mail,
  Printer,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { FormErrors } from "@/components/form-errors"
import { ImageUpload } from "@/components/image-upload"
import { PublicFooter } from "@/components/public-footer"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SiteIcon, siteConfig } from "@/config/site"
import { riderApplySchema, validateFormData } from "@/lib/validation"

interface FormState {
  name: string
  email: string
  phone: string
  zone: string
  address: string
  nidNumber: string
  nidFrontImage: string
  nidBackImage: string
  nidSelfieImage: string
  warehouseId: string
  password: string
}

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  zone: "",
  address: "",
  nidNumber: "",
  nidFrontImage: "",
  nidBackImage: "",
  nidSelfieImage: "",
  warehouseId: "",
  password: "",
}

interface WarehouseOption {
  id: string
  name: string
  city: string
}

export default function ApplyRiderPage() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedCreds, setSubmittedCreds] = useState<{
    email: string
    password: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)

  // Load active warehouses for the selector (public, no auth required).
  useEffect(() => {
    let cancelled = false
    fetch("/api/warehouses/public")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: WarehouseOption[]) => {
        if (!cancelled) setWarehouses(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // NID uploads happen before the applicant has an account, so they need a
  // short-lived signed upload token (ROADMAP P0.2) — fetched fresh per upload.
  async function provideUploadToken(): Promise<string | null> {
    try {
      const res = await fetch("/api/uploads/token", { method: "POST" })
      const data = await res.json().catch(() => null)
      return res.ok && typeof data?.token === "string" ? data.token : null
    } catch {
      return null
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!acceptedPolicies) {
      setError(
        "You must accept the Terms of Service and Privacy Policy to apply.",
      )
      return
    }
    const fieldErrors = validateFormData(riderApplySchema, {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      zone: form.zone.trim(),
      address: form.address.trim(),
      nidNumber: form.nidNumber.trim(),
      nidFrontImage: form.nidFrontImage,
      nidBackImage: form.nidBackImage,
      nidSelfieImage: form.nidSelfieImage,
      warehouseId: form.warehouseId,
      password: form.password,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const res = await fetch("/api/rider-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          zone: form.zone.trim(),
          address: form.address.trim(),
          nidNumber: form.nidNumber.trim(),
          nidFrontImage: form.nidFrontImage,
          nidBackImage: form.nidBackImage,
          nidSelfieImage: form.nidSelfieImage,
          warehouseId: form.warehouseId,
          password: form.password,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          data?.error ?? "Could not submit application. Please try again.",
        )
        return
      }
      setSubmitted(true)
      setSubmittedCreds({
        email: form.email.trim(),
        password: form.password,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <main id="main-content" className="flex min-h-screen flex-col">
        {/* Header */}
        <header className="border-border/70 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <SiteIcon className="size-5" />
              <span className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        </header>

        {/* Content */}
        <section className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 sm:py-12">
          <div className="w-full max-w-lg">
            {submitted ? (
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                  <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                    <CheckCircle2 className="size-6" />
                  </div>
                  <CardTitle className="text-2xl text-balance">
                    Application received
                  </CardTitle>
                  <CardDescription className="leading-relaxed text-pretty">
                    Thanks,{" "}
                    <span className="text-foreground font-medium">
                      {form.name}
                    </span>
                    . Your application has been submitted and is now{" "}
                    <span className="text-foreground font-medium">
                      under review
                    </span>
                    .
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {/* Steps */}
                  <div className="flex flex-col gap-0">
                    {[
                      {
                        icon: FileCheck,
                        label: "Application submitted",
                        desc: "Your details have been received",
                        done: true,
                      },
                      {
                        icon: ShieldCheck,
                        label: "Under review by team",
                        desc: "We're verifying your information",
                        done: false,
                        active: true,
                      },
                      {
                        icon: Mail,
                        label: "Account approved",
                        desc: "You'll receive an email notification",
                        done: false,
                      },
                    ].map((step, i, arr) => (
                      <div key={step.label} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                              step.done
                                ? "bg-primary text-primary-foreground"
                                : step.active
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step.done ? (
                              <CheckCircle2 className="size-4" />
                            ) : step.active ? (
                              <Clock className="size-4 animate-pulse" />
                            ) : (
                              <span className="text-xs font-medium">
                                {i + 1}
                              </span>
                            )}
                          </div>
                          {i < arr.length - 1 && (
                            <div
                              className={`w-px flex-1 ${
                                step.done ? "bg-primary" : "bg-border"
                              }`}
                            />
                          )}
                        </div>
                        <div className="pb-5">
                          <p
                            className={`text-sm leading-tight font-medium ${
                              step.done || step.active
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Credentials */}
                  {submittedCreds && (
                    <div className="bg-muted/50 rounded-lg border p-4">
                      <p className="text-foreground mb-2 text-sm font-medium">
                        Your login credentials
                      </p>
                      <div className="flex flex-col gap-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16">
                            Email
                          </span>
                          <code className="bg-background rounded px-2 py-0.5 font-mono text-xs">
                            {submittedCreds.email}
                          </code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16">
                            Password
                          </span>
                          <code className="bg-background rounded px-2 py-0.5 font-mono text-xs">
                            {submittedCreds.password}
                          </code>
                        </div>
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs">
                        Save these credentials. You&apos;ll need them to log in
                        once your application is approved.
                      </p>
                    </div>
                  )}

                  <Button
                    render={<Link href="/login" />}
                    nativeButton={false}
                    className="w-full"
                  >
                    Go to login
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setForm(EMPTY)
                      setSubmitted(false)
                      setSubmittedCreds(null)
                    }}
                  >
                    Submit another application
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-1">
                  <CardTitle className="text-2xl">Apply as a rider</CardTitle>
                  <CardDescription>
                    Fill in your details. Approval is required before you can
                    start accepting deliveries.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        placeholder="Karim Hossain"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+8801712345678"
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="zone">Service zone</Label>
                        <Input
                          id="zone"
                          placeholder="Dhaka North"
                          value={form.zone}
                          onChange={(e) => update("zone", e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="warehouse">Preferred warehouse</Label>
                        <Select
                          value={form.warehouseId}
                          onValueChange={(v) => update("warehouseId", v ?? "")}
                          required
                        >
                          <SelectTrigger id="warehouse" className="w-full">
                            <SelectValue placeholder="Select a warehouse">
                              {(() => {
                                const w = warehouses.find(
                                  (x) => x.id === form.warehouseId,
                                )
                                return w ? `${w.name}-${w.city}` : undefined
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name}-{w.city}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="address">Home address</Label>
                      <Input
                        id="address"
                        placeholder="House 14, Road 7, Dhanmondi, Dhaka"
                        value={form.address}
                        onChange={(e) => update("address", e.target.value)}
                        required
                      />
                    </div>

                    {/* NID section */}
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="nidNumber">National ID number</Label>
                        <Input
                          id="nidNumber"
                          placeholder="1234567890"
                          value={form.nidNumber}
                          onChange={(e) => update("nidNumber", e.target.value)}
                        />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Upload clear photos of your National ID (front and back)
                        and a selfie holding your NID. This speeds up
                        verification.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs">
                            NID Front
                          </span>
                          <ImageUpload
                            value={form.nidFrontImage || null}
                            onChange={(url) =>
                              update("nidFrontImage", url ?? "")
                            }
                            folder="nids"
                            label="Upload front"
                            className="h-36"
                            uploadToken={provideUploadToken}
                            hidePreview
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs">
                            NID Back
                          </span>
                          <ImageUpload
                            value={form.nidBackImage || null}
                            onChange={(url) =>
                              update("nidBackImage", url ?? "")
                            }
                            folder="nids"
                            label="Upload back"
                            className="h-36"
                            uploadToken={provideUploadToken}
                            hidePreview
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs">
                            Selfie with NID
                          </span>
                          <ImageUpload
                            value={form.nidSelfieImage || null}
                            onChange={(url) =>
                              update("nidSelfieImage", url ?? "")
                            }
                            folder="nids"
                            label="Upload selfie"
                            className="h-36"
                            uploadToken={provideUploadToken}
                            hidePreview
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="karim@email.com"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Choose a password"
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        required
                        minLength={8}
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

                    <FormErrors
                      errors={Object.keys(errors).length > 0 ? errors : null}
                    />

                    <label className="flex items-start lg:items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={acceptedPolicies}
                        onChange={(e) => setAcceptedPolicies(e.target.checked)}
                        className="border-border mt-0.5 rounded"
                      />
                      <span className="text-muted-foreground">
                        I agree to the{" "}
                        <Link
                          href="/terms"
                          target="_blank"
                          className="text-primary font-medium hover:underline"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          href="/privacy"
                          target="_blank"
                          className="text-primary font-medium hover:underline"
                        >
                          Privacy Policy
                        </Link>
                      </span>
                    </label>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Submitting
                        </>
                      ) : (
                        "Submit application"
                      )}
                    </Button>
                  </form>

                  <p className="text-muted-foreground mt-6 text-center text-sm">
                    Already have an account?{" "}
                    <Link
                      href="/login"
                      className="text-primary font-medium hover:underline"
                    >
                      Log in
                    </Link>
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  )
}
