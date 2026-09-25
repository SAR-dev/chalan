"use client"

import { Copy, Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/features/account/hooks/use-auth"
import { usePlatformConfig } from "@/features/platform-config/hooks/use-platform-config"
import { authClient } from "@/lib/auth-client"
import { totpSecretFromUri } from "@/lib/two-factor"

type Panel = "none" | "password" | "verify" | "codes" | "disable"
type PasswordPurpose = "enable" | "regenerate"

/**
 * TOTP enrollment for admin roles (ROADMAP H4). Every Better Auth call goes
 * through `authClient.twoFactor.*`; disabling goes through this app's own
 * `/api/account/two-factor/disable` route, which demands a current TOTP or
 * recovery code. The "require 2FA" switch is SUPER_ADMIN-only.
 */
export function TwoFactorSettings() {
  const { currentUser, refreshUser } = useAuth()
  const { config, updatePlatformConfig } = usePlatformConfig()

  const enabled = currentUser?.twoFactorEnabled === true
  const requireToggle = config?.requireAdminTwoFactor === true

  const [panel, setPanel] = useState<Panel>("none")
  const [passwordPurpose, setPasswordPurpose] =
    useState<PasswordPurpose>("enable")
  const [password, setPassword] = useState("")
  const [pendingSecret, setPendingSecret] = useState<string | null>(null)
  const [pendingUri, setPendingUri] = useState<string | null>(null)
  const [pendingCodes, setPendingCodes] = useState<string[]>([])
  const [code, setCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setPanel("none")
    setPassword("")
    setCode("")
    setPendingSecret(null)
    setPendingUri(null)
    setPendingCodes([])
  }

  function startPassword(purpose: PasswordPurpose) {
    setPasswordPurpose(purpose)
    setPassword("")
    setPanel("password")
  }

  async function handleRequireToggle(checked: boolean) {
    const result = await updatePlatformConfig({
      requireAdminTwoFactor: checked,
    })
    if (result.ok) {
      toast.success(
        checked
          ? "Admins must now enroll in two-factor authentication."
          : "Two-factor authentication is no longer required.",
      )
    } else {
      toast.error(result.error ?? "Could not update the requirement.")
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    try {
      if (passwordPurpose === "regenerate") {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({
          password,
        })
        if (error || !data) {
          toast.error(error?.message ?? "Could not regenerate recovery codes.")
          return
        }
        setRecoveryCodes(data.backupCodes)
        setPassword("")
        setPanel("codes")
        return
      }

      const { data, error } = await authClient.twoFactor.enable({
        password,
        method: "totp",
      })
      if (error || !data) {
        toast.error(error?.message ?? "Could not start two-factor setup.")
        return
      }
      const uri = "totpURI" in data ? data.totpURI : undefined
      const codes = "backupCodes" in data ? data.backupCodes : undefined
      if (!uri || !codes) {
        toast.error("Could not start two-factor setup.")
        return
      }
      setPendingSecret(totpSecretFromUri(uri))
      setPendingUri(uri)
      setPendingCodes(codes)
      setPassword("")
      setPanel("verify")
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: code.trim(),
      })
      if (error) {
        toast.error(error.message ?? "That verification code is not valid.")
        return
      }
      await refreshUser()
      setRecoveryCodes(pendingCodes)
      setCode("")
      setPendingSecret(null)
      setPendingUri(null)
      setPendingCodes([])
      setPanel("codes")
      toast.success("Two-factor authentication enabled.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDisableSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/account/two-factor/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Could not disable two-factor auth.")
        return
      }
      await refreshUser()
      setRecoveryCodes(null)
      reset()
      toast.success("Two-factor authentication disabled.")
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyRecoveryCodes() {
    if (!recoveryCodes) return
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"))
      toast.success("Recovery codes copied.")
    } catch {
      toast.error("Could not copy the recovery codes.")
    }
  }

  return (
    <Card className="max-w-lg" data-testid="two-factor-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Two-factor authentication
        </CardTitle>
        <CardDescription>
          Protect your account with a time-based code from an authenticator app,
          plus one-time recovery codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label>Status</Label>
            <Badge
              variant={enabled ? "default" : "secondary"}
              data-testid="two-factor-status"
            >
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          {!enabled && panel === "none" ? (
            <Button
              type="button"
              data-testid="two-factor-enable"
              onClick={() => startPassword("enable")}
            >
              Enable 2FA
            </Button>
          ) : null}
        </div>

        {enabled && panel === "none" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="two-factor-regenerate"
              onClick={() => startPassword("regenerate")}
            >
              Regenerate recovery codes
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="two-factor-disable"
              onClick={() => {
                setCode("")
                setPanel("disable")
              }}
            >
              <ShieldOff className="size-4" />
              Disable 2FA
            </Button>
          </div>
        ) : null}

        {panel === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-password">
                {passwordPurpose === "regenerate"
                  ? "Confirm your password to generate new recovery codes"
                  : "Confirm your password to start setup"}
              </Label>
              <Input
                id="two-factor-password"
                data-testid="two-factor-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                data-testid="two-factor-password-submit"
                disabled={busy || !password}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Working
                  </>
                ) : passwordPurpose === "regenerate" ? (
                  "Generate codes"
                ) : (
                  "Continue"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="two-factor-password-cancel"
                onClick={reset}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {panel === "verify" ? (
          <form onSubmit={handleVerifySubmit} className="flex flex-col gap-4">
            {pendingUri ? (
              <div className="flex flex-col items-center gap-2">
                <QRCodeSVG
                  value={pendingUri}
                  size={176}
                  data-testid="two-factor-qr"
                  className="rounded-lg border bg-white p-2"
                />
                <p className="text-muted-foreground text-center text-xs">
                  Scan with your authenticator app (Google Authenticator, Authy,
                  1Password…).
                </p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-secret">
                Or enter this setup key manually
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="two-factor-secret"
                  data-testid="two-factor-secret"
                  readOnly
                  value={pendingSecret ?? ""}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Copy setup key"
                  data-testid="two-factor-secret-copy"
                  onClick={() => {
                    if (!pendingSecret) return
                    navigator.clipboard
                      .writeText(pendingSecret)
                      .then(() => toast.success("Setup key copied."))
                      .catch(() => toast.error("Could not copy the key."))
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Add the key to your authenticator app, then enter the 6-digit
                code it shows.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-code">Verification code</Label>
              <Input
                id="two-factor-code"
                data-testid="two-factor-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                data-testid="two-factor-verify-submit"
                disabled={busy || !code.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying
                  </>
                ) : (
                  "Verify and enable"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="two-factor-verify-cancel"
                onClick={reset}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {panel === "codes" && recoveryCodes ? (
          <div
            className="flex flex-col gap-3"
            data-testid="two-factor-recovery-codes"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Recovery codes</p>
              <p className="text-muted-foreground text-xs">
                Store these somewhere safe — each code works once if you lose
                access to your authenticator app. They are shown only now.
              </p>
            </div>
            <div className="bg-muted rounded-md p-3 font-mono text-sm">
              <ul className="flex flex-col gap-1">
                {recoveryCodes.map((recoveryCode) => (
                  <li key={recoveryCode}>{recoveryCode}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="two-factor-recovery-copy"
                onClick={handleCopyRecoveryCodes}
              >
                <Copy className="size-4" />
                Copy codes
              </Button>
              <Button
                type="button"
                data-testid="two-factor-recovery-done"
                onClick={() => {
                  setRecoveryCodes(null)
                  reset()
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "disable" ? (
          <form onSubmit={handleDisableSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="two-factor-disable-code">
                Enter your current authenticator code or a recovery code to
                confirm
              </Label>
              <Input
                id="two-factor-disable-code"
                data-testid="two-factor-disable-input"
                type="text"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="destructive"
                data-testid="two-factor-disable-submit"
                disabled={busy || !code.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Disabling
                  </>
                ) : (
                  "Confirm disable"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="two-factor-disable-cancel"
                onClick={reset}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {currentUser?.role === "SUPER_ADMIN" ? (
          <div className="border-border flex items-center justify-between gap-4 border-t pt-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="two-factor-require">Require 2FA for admins</Label>
              <p className="text-muted-foreground text-xs">
                When on, admin accounts must enroll before they can use the
                dashboards. Off by default.
              </p>
            </div>
            <Switch
              id="two-factor-require"
              checked={requireToggle}
              onCheckedChange={handleRequireToggle}
              data-testid="two-factor-require-toggle"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
