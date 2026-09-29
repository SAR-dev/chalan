"use client"

import {
  CheckCircle2,
  Loader2,
  Lock,
  MailCheck,
  Send,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { siteConfig } from "@/config/site"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { safeNextPath } from "@/lib/auth-redirect"
import type { SeededSignIn } from "@/lib/dev-mode"

const LOGIN_EMAIL_PLACEHOLDER = "you@email.com"

const BrandIcon = siteConfig.icon

export function LoginForm({
  seededSignIns,
}: {
  seededSignIns?: SeededSignIn[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, verifyTwoFactor, currentUser, isReady } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [needsActivation, setNeedsActivation] = useState(false)
  const [activationEmail, setActivationEmail] = useState("")
  const [canResendActivation, setCanResendActivation] = useState(true)
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
    "idle",
  )
  const [success, setSuccess] = useState<string | null>(null)
  const [twoFactorStep, setTwoFactorStep] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState("")
  const [twoFactorRecovery, setTwoFactorRecovery] = useState(false)
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null)
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false)

  // Only present when NEXT_DEVELOPMENT_MODE is on (the server page decides), so
  // the picker never renders on a deployment that didn't ask for it.
  const devAccounts = seededSignIns?.length ? seededSignIns : undefined

  // Where to land after a successful sign-in: ?next= (set by automatic-logout
  // redirects) wins over the role's home page.
  const nextPath = safeNextPath(searchParams.get("next"))

  useEffect(() => {
    if (isReady && currentUser) {
      router.replace(nextPath ?? homeForRole(currentUser.role))
    }
  }, [isReady, currentUser, router, nextPath])

  useEffect(() => {
    const successParam = searchParams.get("success")
    if (successParam === "email-verified") {
      setSuccess(
        "Your email has been verified and your account is now active. You can now sign in.",
      )
    }
  }, [searchParams])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsActivation(false)
    setCanResendActivation(true)
    setSubmitting(true)
    const result = await login(email, password)
    if (result.ok && result.user) {
      router.replace(nextPath ?? homeForRole(result.user.role))
    } else if (result.ok) {
      router.replace(nextPath ?? "/dashboard")
    } else if (result.needsTwoFactor) {
      // Password accepted — Better Auth is waiting for the second factor.
      setTwoFactorStep(true)
      setTwoFactorCode("")
      setTwoFactorRecovery(false)
      setSubmitting(false)
    } else if (result.needsActivation && result.activationEmail) {
      setNeedsActivation(true)
      setActivationEmail(result.activationEmail)
      setCanResendActivation(result.canResend !== false)
      setSubmitting(false)
    } else {
      setError(result.error ?? "Unable to sign in.")
      setSubmitting(false)
    }
  }

  async function handleTwoFactorSubmit(e: FormEvent) {
    e.preventDefault()
    setTwoFactorError(null)
    setVerifyingTwoFactor(true)
    const result = await verifyTwoFactor(
      twoFactorCode,
      twoFactorRecovery ? "backup" : "totp",
    )
    if (result.ok && result.user) {
      router.replace(nextPath ?? homeForRole(result.user.role))
    } else if (result.ok) {
      router.replace(nextPath ?? "/dashboard")
    } else {
      setTwoFactorError(result.error ?? "Unable to verify the code.")
      setVerifyingTwoFactor(false)
    }
  }

  async function handleResendActivation() {
    setResendStatus("sending")
    try {
      const res = await fetch("/api/merchants/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: activationEmail }),
      })
      if (res.ok) {
        setResendStatus("sent")
      } else {
        setResendStatus("idle")
      }
    } catch {
      setResendStatus("idle")
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
        {/* Brand panel */}
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
              Everything you need, in one place.
            </h1>
            <p className="text-sidebar-foreground/70 mt-4 leading-relaxed text-pretty">
              Whether you're managing deliveries, tracking orders, or running
              operations — sign in to access your workspace.
            </p>
          </div>

          <p className="text-sidebar-foreground/50 text-xs">
            {"\u00A9"} {new Date().getFullYear()} {siteConfig.name}. Internal
            use only.
          </p>
        </section>

        {/* Form panel */}
        <section className="flex flex-1 items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm">
            <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg">
                <BrandIcon className="size-5" />
              </div>
              <span className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </Link>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="flex flex-col gap-1">
                <CardTitle className="text-2xl">
                  {twoFactorStep ? "Two-factor verification" : "Welcome back"}
                </CardTitle>
                <CardDescription>
                  {twoFactorStep
                    ? "Enter the code from your authenticator app to finish signing in."
                    : "Sign in to access your workspace."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {twoFactorStep ? (
                  <form
                    onSubmit={handleTwoFactorSubmit}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="two-factor-code">
                        {twoFactorRecovery
                          ? "Recovery code"
                          : "Authentication code"}
                      </Label>
                      <Input
                        id="two-factor-code"
                        data-testid="two-factor-login-input"
                        type="text"
                        inputMode={twoFactorRecovery ? "text" : "numeric"}
                        autoComplete="one-time-code"
                        placeholder={
                          twoFactorRecovery ? "xxxxx-xxxxx" : "123456"
                        }
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    {twoFactorError ? (
                      <p
                        role="alert"
                        className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                      >
                        {twoFactorError}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      data-testid="two-factor-login-submit"
                      className="w-full"
                      disabled={verifyingTwoFactor}
                    >
                      {verifyingTwoFactor ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Verifying
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-4" />
                          Verify
                        </>
                      )}
                    </Button>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        data-testid="two-factor-login-recovery"
                        onClick={() => {
                          setTwoFactorRecovery((v) => !v)
                          setTwoFactorCode("")
                          setTwoFactorError(null)
                        }}
                        className="text-muted-foreground hover:underline"
                      >
                        {twoFactorRecovery
                          ? "Use an authenticator code instead"
                          : "Use a recovery code"}
                      </button>
                      <button
                        type="button"
                        data-testid="two-factor-login-back"
                        onClick={() => {
                          setTwoFactorStep(false)
                          setTwoFactorCode("")
                          setTwoFactorError(null)
                        }}
                        className="text-muted-foreground hover:underline"
                      >
                        Back to sign in
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <form
                      onSubmit={handleSubmit}
                      className="flex flex-col gap-4"
                    >
                      {devAccounts ? (
                        <div
                          className="bg-muted/50 flex flex-col gap-2 rounded-md border border-dashed p-3"
                          data-testid="login-dev-accounts"
                        >
                          <Label
                            htmlFor="login-dev-account"
                            className="text-muted-foreground text-xs"
                          >
                            Demo accounts
                          </Label>
                          <Select
                            value={null}
                            onValueChange={(value) => {
                              const picked = devAccounts.find(
                                (account) => account.email === value,
                              )
                              if (!picked) return
                              setEmail(picked.email)
                              setPassword(picked.password)
                              setError(null)
                            }}
                          >
                            <SelectTrigger
                              id="login-dev-account"
                              data-testid="login-dev-account-trigger"
                              className="w-full"
                            >
                              <SelectValue placeholder="Sign in as…" />
                            </SelectTrigger>
                            <SelectContent>
                              {devAccounts.map((account) => (
                                <SelectItem
                                  key={account.email}
                                  value={account.email}
                                  data-testid={`login-dev-account-${account.email}`}
                                >
                                  {account.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-muted-foreground text-xs">
                            Fills the form with a seeded account. Development
                            only.
                          </p>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          data-testid="login-email"
                          type="email"
                          autoComplete="email"
                          placeholder={LOGIN_EMAIL_PLACEHOLDER}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          data-testid="login-password"
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <Link
                          href="/forgot-password"
                          className="text-muted-foreground text-xs hover:underline"
                        >
                          Forgot your password?
                        </Link>
                      </div>

                      {error && !needsActivation ? (
                        <p
                          role="alert"
                          data-testid="login-error"
                          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                        >
                          {error}
                        </p>
                      ) : null}

                      {needsActivation ? (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 rounded-md border px-4 py-3">
                          <div className="flex items-start gap-2">
                            <MailCheck className="text-amber-600 dark:text-amber-400 mt-0.5 size-4 shrink-0" />
                            <div className="flex flex-col gap-1">
                              <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                                Please verify your email address
                              </p>
                              <p className="text-amber-700 dark:text-amber-300 text-xs">
                                We sent a verification link to{" "}
                                <span className="font-medium">
                                  {activationEmail}
                                </span>
                                . Check your inbox and click the link to
                                activate your account.
                              </p>
                              {!canResendActivation ? (
                                <p className="text-amber-700 dark:text-amber-300 mt-1 text-xs">
                                  Ask the person who invited you to resend the
                                  activation email.
                                </p>
                              ) : resendStatus === "sent" ? (
                                <p className="text-amber-600 dark:text-amber-400 mt-1 text-xs font-medium">
                                  Verification email sent! Check your inbox.
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleResendActivation}
                                  disabled={resendStatus === "sending"}
                                  className="text-amber-800 dark:text-amber-200 mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-50"
                                >
                                  {resendStatus === "sending" ? (
                                    <>
                                      <Loader2 className="size-3 animate-spin" />
                                      Sending...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="size-3" />
                                      Resend activation email
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {success ? (
                        <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 rounded-md border px-4 py-3">
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="text-green-600 dark:text-green-400 mt-0.5 size-4 shrink-0" />
                            <p className="text-green-800 dark:text-green-200 text-sm">
                              {success}
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <Button
                        type="submit"
                        data-testid="login-submit"
                        className="w-full"
                        disabled={submitting}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Signing in
                          </>
                        ) : (
                          <>
                            <Lock className="size-4" />
                            Sign in
                          </>
                        )}
                      </Button>
                    </form>

                    <p className="text-muted-foreground mt-6 text-center text-sm">
                      Are you a merchant?{" "}
                      <Link
                        href="/register"
                        className="text-primary font-medium hover:underline"
                      >
                        Create an account
                      </Link>
                    </p>
                  </>
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
