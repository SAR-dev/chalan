"use client"

import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react"
import Link from "next/link"
import { FormEvent, useState } from "react"
import { FormErrors } from "@/components/form-errors"
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
import { merchantRegisterSchema, validateFormData } from "@/lib/validation"

const BUSINESS_TYPES = [
  "E-commerce",
  "Restaurant",
  "Grocery",
  "Pharmacy",
  "Fashion",
  "Electronics",
  "Other",
] as const

interface FormState {
  businessName: string
  ownerName: string
  email: string
  phone: string
  address: string
  businessType: string
  password: string
}

const EMPTY: FormState = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  address: "",
  businessType: "",
  password: "",
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [submittedCreds, setSubmittedCreds] = useState<{
    email: string
    password: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!acceptedPolicies) {
      setError(
        "You must accept the Terms of Service and Privacy Policy to register.",
      )
      return
    }
    const fieldErrors = validateFormData(merchantRegisterSchema, {
      businessName: form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      businessType: form.businessType,
      password: form.password,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const businessName = form.businessName.trim()
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          ownerName: form.ownerName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          businessType: form.businessType,
          password: form.password,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          data?.error ?? "Could not complete registration. Please try again.",
        )
        return
      }
      setSubmittedName(businessName)
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
      <main
        id="main-content"
        className="flex min-h-screen flex-col lg:flex-row"
      >
        {/* Brand panel */}
        <section className="bg-sidebar text-sidebar-foreground relative hidden flex-1 flex-col justify-between p-12 lg:flex">
          <Link href="/" className="flex items-center gap-2">
            <SiteIcon className="size-5" />
            <span className="text-lg font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>

          <div className="max-w-md">
            <p className="text-sidebar-primary text-sm font-medium tracking-widest uppercase">
              Merchant Onboarding
            </p>
            <h1 className="mt-4 text-4xl leading-tight font-semibold text-balance">
              Start shipping with a nationwide delivery network.
            </h1>
            <p className="text-sidebar-foreground/70 mt-4 leading-relaxed text-pretty">
              Register your business in minutes. Once our team approves your
              account, you&apos;ll get your assigned delivery rates and can
              begin creating orders right away.
            </p>
            <ul className="text-sidebar-foreground/80 mt-8 space-y-3 text-sm">
              {[
                "Transparent per-order pricing",
                "Real-time order tracking",
                "Flexible pickup locations",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="text-sidebar-primary size-4" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sidebar-foreground/50 text-xs">
            {"\u00A9"} {new Date().getFullYear()} {siteConfig.name} Logistics.
          </p>
        </section>

        {/* Form panel */}
        <section className="flex flex-1 items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <SiteIcon className="size-5" />
              </div>
              <span className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </Link>

            {submittedName ? (
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                  <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                    <Mail className="size-6" />
                  </div>
                  <CardTitle className="text-2xl text-balance">
                    Check your email
                  </CardTitle>
                  <CardDescription className="leading-relaxed text-pretty">
                    We&apos;ve sent an activation link to{" "}
                    <span className="text-foreground font-medium">
                      {submittedCreds?.email}
                    </span>
                    . Click the link in the email to verify your account and
                    start creating orders. If you don&apos;t see it within a few
                    minutes, please check your spam or junk folder.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
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
                      setSubmittedName(null)
                      setSubmittedCreds(null)
                    }}
                  >
                    Register another business
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-col gap-1">
                  <CardTitle className="text-2xl">
                    Create your merchant account
                  </CardTitle>
                  <CardDescription>
                    Tell us about your business. Verify your email to start
                    shipping.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    data-testid="register-form"
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="businessName">Business name</Label>
                      <Input
                        id="businessName"
                        data-testid="register-business-name"
                        placeholder="Threadline Apparel"
                        value={form.businessName}
                        onChange={(e) => update("businessName", e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="businessType">Business type</Label>
                      <Select
                        value={form.businessType}
                        onValueChange={(v) => update("businessType", v ?? "")}
                      >
                        <SelectTrigger id="businessType" className="w-full">
                          <SelectValue placeholder="Select a business type" />
                        </SelectTrigger>
                        <SelectContent>
                          {BUSINESS_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ownerName">Owner / contact name</Label>
                      <Input
                        id="ownerName"
                        placeholder="Imran Kabir"
                        value={form.ownerName}
                        onChange={(e) => update("ownerName", e.target.value)}
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
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="address">Business address</Label>
                      <Input
                        id="address"
                        placeholder="House 14, Road 7, Dhanmondi, Dhaka"
                        value={form.address}
                        onChange={(e) => update("address", e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          data-testid="register-email"
                          type="email"
                          placeholder="you@business.com"
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
                          minLength={6}
                        />
                      </div>
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
                        "Submit registration"
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
