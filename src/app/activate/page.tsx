"use client"

import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { authClient } from "@/lib/auth-client"

function ActivateForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not activate the account.")
        setSubmitting(false)
        return
      }
      setDone(true)
      // The invitee may already be signed in as somebody else (shared machine,
      // admin testing an invite). Drop that session before showing the
      // confirmation so the next sign-in is the account they just activated.
      try {
        await authClient.signOut()
      } catch {
        // No session, or sign-out failed — the confirmation page is still
        // correct, so don't block the navigation on it.
      }
      router.push("/activated")
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-screen flex-col"
    >
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle className="bg-background/80 backdrop-blur" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-col gap-1">
              {/* Mobile brand: inside the card, so a phone shows one framed
                  box instead of a detached logo above a second frame. This page
                  has no large-screen brand panel, so it stays visible at `lg`. */}
              <AuthCardBrand center hideOnLarge={false} className="mb-3" />
              <CardTitle className="text-2xl">
                {done ? "Account activated" : "Activate your account"}
              </CardTitle>
              <CardDescription>
                {done
                  ? "You can now sign in with your new password."
                  : "Choose a password to finish setting up your account."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {done ? (
                <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 flex items-start gap-2 rounded-md border px-4 py-3">
                  <CheckCircle2 className="text-green-600 dark:text-green-400 mt-0.5 size-4 shrink-0" />
                  <p className="text-green-800 dark:text-green-200 text-sm">
                    Your account is active.{" "}
                    <Link
                      href="/activated"
                      className="font-medium underline"
                      data-testid="activate-continue"
                    >
                      Continue
                    </Link>
                  </p>
                </div>
              ) : !token ? (
                <p
                  role="alert"
                  className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                  data-testid="activate-error"
                >
                  This activation link is invalid. Ask for a new one.
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="activate-password">New password</Label>
                    <Input
                      id="activate-password"
                      data-testid="activate-password"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="activate-confirm">Confirm password</Label>
                    <Input
                      id="activate-confirm"
                      data-testid="activate-confirm"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </div>

                  {error ? (
                    <p
                      role="alert"
                      className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                      data-testid="activate-error"
                    >
                      {error}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    data-testid="activate-submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Activating
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        Activate account
                      </>
                    )}
                  </Button>
                  <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                    <Lock className="size-3" />
                    Your password is encrypted and never shared.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <PublicFooter />
    </main>
  )
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <ActivateForm />
    </Suspense>
  )
}
