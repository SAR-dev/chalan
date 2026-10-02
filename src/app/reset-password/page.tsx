"use client"

import { CheckCircle2, KeyRound, Loader2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FormEvent, Suspense, useState } from "react"
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

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) {
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
                Invalid link
              </h1>
              <p className="text-sidebar-foreground/70 mt-4 leading-relaxed text-pretty">
                The password reset link is invalid or has expired. Please
                request a new one.
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
                <CardHeader>
                  {/* This branch had no logo at all on mobile - the split
                      brand panel above is `hidden lg:flex` - so it gets the
                      same in-card lockup the valid-link branch uses. */}
                  <AuthCardBrand href="/login" className="mb-3" />
                  <CardTitle className="text-2xl">Invalid link</CardTitle>
                  <CardDescription>
                    This password reset link is invalid or has expired.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href="/forgot-password"
                    className="text-primary font-medium hover:underline"
                  >
                    Request a new reset link
                  </Link>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
        <PublicFooter />
      </>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? "Unable to reset password.")
        return
      }
      setSubmitted(true)
    } catch {
      setError("Unable to reset password. Please try again.")
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
              Set a new password
            </h1>
            <p className="text-sidebar-foreground/70 mt-4 leading-relaxed text-pretty">
              Enter your new password below to complete the reset process.
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
                <CardTitle className="text-2xl">Reset password</CardTitle>
                <CardDescription>
                  Enter your new password below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <CheckCircle2 className="text-green-600 dark:text-green-400 size-12" />
                    <p className="text-sm">
                      Your password has been reset successfully.
                    </p>
                    <Link href="/login">
                      <Button>Sign in with new password</Button>
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="password">New password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="confirmPassword">
                        Confirm new password
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
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
                          Resetting password
                        </>
                      ) : (
                        <>
                          <KeyRound className="size-4" />
                          Reset password
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
