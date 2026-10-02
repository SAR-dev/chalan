"use client"

import { CheckCircle2, Loader2, Mail } from "lucide-react"
import Link from "next/link"
import { FormEvent, useState } from "react"
import { AuthCardBrand } from "@/components/auth-card-brand"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
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
import { siteConfig } from "@/config/site"

const BrandIcon = siteConfig.icon

async function requestPasswordReset(
  email: string,
): Promise<{ error?: string }> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ""
  const redirectTo = `${window.location.origin}/reset-password`
  const res = await fetch(`${base}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirectTo }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    return { error: body?.error?.message ?? "Unable to send reset email." }
  }
  return {}
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await requestPasswordReset(email)
      if (result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
      }
    } catch {
      setError("Unable to send reset email. Please try again.")
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
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle className="bg-background/80 backdrop-blur" />
        </div>
        <section className="bg-sidebar text-sidebar-foreground relative hidden flex-1 flex-col justify-between p-12 lg:flex">
          <Link href="/" className="flex items-center gap-2">
            <BrandIcon className="size-5" />
            <span className="text-lg font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>
          <div className="max-w-md">
            <p className="text-sidebar-primary text-sm font-medium tracking-widest uppercase">
              {siteConfig.tagline}
            </p>
            <h1 className="mt-4 text-4xl leading-tight font-semibold text-balance">
              Reset your password
            </h1>
            <p className="text-sidebar-foreground/70 mt-4 leading-relaxed text-pretty">
              Enter the email address associated with your account and we'll
              send you a link to reset your password.
            </p>
          </div>
          <p className="text-sidebar-foreground/50 text-xs">
            {"\u00A9"} {new Date().getFullYear()} {siteConfig.name}. Internal
            use only.
          </p>
        </section>

        <section className="flex flex-1 items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-1">
                {/* Mobile brand: inside the card, so a phone shows one framed
                    box instead of a detached logo above a second frame. Links
                    back to sign-in, which is where this flow started. */}
                <AuthCardBrand href="/login" className="mb-3" />
                <CardTitle className="text-2xl">Forgot password?</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a reset link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 rounded-md border px-4 py-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="text-green-600 dark:text-green-400 mt-0.5 size-4 shrink-0" />
                      <p className="text-green-800 dark:text-green-200 text-sm">
                        If an account exists with{" "}
                        <span className="font-medium">{email}</span>, you'll
                        receive a password reset email shortly.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    {error && (
                      <p
                        role="alert"
                        className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                      >
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Sending link
                        </>
                      ) : (
                        <>
                          <Mail className="size-4" />
                          Send reset link
                        </>
                      )}
                    </Button>
                  </form>
                )}

                <p className="text-muted-foreground mt-6 text-center text-sm">
                  <Link
                    href="/login"
                    className="text-primary font-medium hover:underline"
                  >
                    Back to sign in
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  )
}
