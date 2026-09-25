"use client"

import {
  Globe,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Smartphone,
  Table2,
  UserRound,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ImageUpload } from "@/components/image-upload"
import { PageHeader } from "@/components/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TwoFactorSettings } from "@/features/account/components/two-factor-settings"
import { useAuth } from "@/features/account/hooks/use-auth"
import { authClient } from "@/lib/auth-client"
import {
  DEFAULT_TABLE_ROWS_PER_PAGE,
  MAX_TABLE_ROWS_PER_PAGE,
} from "@/lib/constants"
import { initials } from "@/lib/utils"

interface Session {
  id: string
  token: string
  expiresAt: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  userAgent: string | null
  userId: string
}

// Client-side form gate only — Better Auth's /change-email zod schema does
// the real validation server-side.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseDevice(userAgent: string | null) {
  if (!userAgent) return { icon: Globe, label: "Unknown device" }
  const ua = userAgent.toLowerCase()
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone"))
    return { icon: Smartphone, label: "Mobile device" }
  if (ua.includes("mac")) return { icon: Laptop, label: "Mac" }
  if (ua.includes("windows")) return { icon: Monitor, label: "Windows PC" }
  return { icon: Globe, label: "Unknown device" }
}

function formatTimeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function AccountSettings() {
  const {
    currentUser,
    updateProfileName,
    updateProfileImage,
    updateProfilePhone,
    changePassword,
    updateTableRowsPerPage,
    refreshUser,
  } = useAuth()

  // ── Profile state ────────────────────────────────────────────────────────
  const [name, setName] = useState(currentUser?.name ?? "")
  const [savingName, setSavingName] = useState(false)
  const [savingImage, setSavingImage] = useState(false)

  const [editingPhone, setEditingPhone] = useState(false)
  const [phone, setPhone] = useState(currentUser?.phone ?? "")
  const [savingPhone, setSavingPhone] = useState(false)

  // ── Email state ───────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState("")
  const [savingEmail, setSavingEmail] = useState(false)

  // ── Password state ───────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  // ── Tabs ─────────────────────────────────────────────────────────────────
  // The require-2FA gate parks unenrolled admins on ?setup=2fa — land them on
  // the dedicated Two-factor tab so the enrollment card is what they see. Read
  // in an effect to keep the server-rendered markup identical to the first
  // client render (no useSearchParams Suspense requirement).
  const [tab, setTab] = useState("profile")

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("setup") === "2fa") {
      setTab("two-factor")
    }
  }, [])

  // A failed confirmation link (expired / invalid / already-used token) comes
  // back as ?error=<code> on the callback URL — Better Auth only encodes it
  // there, so surface it instead of silently landing on the account page.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error")
    if (!code) return
    toast.error(
      code === "TOKEN_EXPIRED"
        ? "That verification link has expired. Send a new one."
        : "That verification link is invalid or has already been used.",
    )
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  // ── Rows-per-page state ──────────────────────────────────────────────────
  const [rowsPerPage, setRowsPerPage] = useState(
    String(currentUser?.tableRowsPerPage ?? DEFAULT_TABLE_ROWS_PER_PAGE),
  )
  const [savingRowsPerPage, setSavingRowsPerPage] = useState(false)

  // ── Sessions state ───────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [revokingToken, setRevokingToken] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const { data, error } = await authClient.listSessions()
      if (!error && data) {
        setSessions(data as unknown as Session[])
      }
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleImageChange(url: string | null) {
    setSavingImage(true)
    try {
      const result = await updateProfileImage(url)
      if (result.ok) {
        toast.success(url ? "Profile photo updated." : "Profile photo removed.")
      } else {
        toast.error(result.error ?? "Could not update your photo.")
      }
    } finally {
      setSavingImage(false)
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === (currentUser?.name ?? "")) return
    setSavingName(true)
    try {
      const result = await updateProfileName(trimmed)
      if (result.ok) {
        toast.success("Your name has been updated.")
      } else {
        toast.error(result.error ?? "Could not update your name.")
      }
    } finally {
      setSavingName(false)
    }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = phone.trim()
    if (!trimmed || trimmed === (currentUser?.phone ?? "")) return
    setSavingPhone(true)
    try {
      const result = await updateProfilePhone(trimmed)
      if (result.ok) {
        toast.success("Your phone number has been updated.")
        setEditingPhone(false)
      } else {
        toast.error(result.error ?? "Could not update your phone number.")
      }
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!EMAIL_PATTERN.test(trimmed) || emailUnchanged) return
    setSavingEmail(true)
    try {
      // Better Auth owns this flow: POST /change-email stores nothing yet —
      // it emails a one-time confirmation link to the NEW address, and
      // `user.email` only flips when that link is opened. The merchant's
      // business email is a separate row and is never touched here.
      const { error } = await authClient.changeEmail({
        newEmail: trimmed,
        // Where the confirmation link drops the user afterwards — a full
        // navigation, so AuthProvider re-reads /api/users/me on arrival.
        callbackURL: window.location.pathname,
      })
      if (error) {
        toast.error(error.message ?? "Could not send the verification email.")
        return
      }
      toast.success(`Verification sent to ${trimmed} — check your inbox.`)
      setNewEmail("")
      // Re-read /api/users/me so the card always shows whatever the server
      // has right now (a confirmation clicked in another tab, etc.).
      await refreshUser()
    } finally {
      setSavingEmail(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !currentPassword ||
      newPassword.length < 8 ||
      newPassword !== confirmPassword
    )
      return
    setSavingPassword(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.ok) {
        toast.success("Your password has been changed.")
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        toast.error(result.error ?? "Could not change your password.")
      }
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleRowsPerPageSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number.parseInt(rowsPerPage, 10)
    if (
      !Number.isInteger(num) ||
      num < 1 ||
      num > MAX_TABLE_ROWS_PER_PAGE ||
      num === (currentUser?.tableRowsPerPage ?? DEFAULT_TABLE_ROWS_PER_PAGE)
    )
      return
    setSavingRowsPerPage(true)
    try {
      const result = await updateTableRowsPerPage(num)
      if (result.ok) {
        toast.success("Rows per page updated.")
      } else {
        toast.error(result.error ?? "Could not update rows per page.")
      }
    } finally {
      setSavingRowsPerPage(false)
    }
  }

  async function handleRevokeSession(session: Session) {
    setRevokingToken(session.token)
    try {
      const { error } = await authClient.revokeSession({
        token: session.token,
      })
      if (error) {
        toast.error(error.message ?? "Could not revoke session.")
        return
      }
      toast.success("Session revoked.")
      setSessions((prev) => prev.filter((s) => s.token !== session.token))
    } finally {
      setRevokingToken(null)
    }
  }

  async function handleRevokeAllSessions() {
    const others = sessions.filter((s) => s.id !== currentSessionId)
    if (others.length === 0) return
    let failed = 0
    for (const s of others) {
      const { error } = await authClient.revokeSession({ token: s.token })
      if (error) failed++
    }
    if (failed > 0) {
      toast.error(`Failed to revoke ${failed} session(s).`)
    } else {
      toast.success(`${others.length} session(s) revoked.`)
    }
    setSessions((prev) => prev.filter((s) => s.id === currentSessionId))
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const trimmedName = name.trim()
  const nameUnchanged = trimmedName === (currentUser?.name ?? "")
  const nameInvalid = trimmedName.length === 0

  const trimmedPhone = phone.trim()
  const phoneUnchanged = trimmedPhone === (currentUser?.phone ?? "")
  const phoneInvalid = trimmedPhone.length === 0

  const trimmedEmail = newEmail.trim()
  const emailUnchanged =
    trimmedEmail.toLowerCase() === (currentUser?.email ?? "").toLowerCase()
  const emailInvalid =
    trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8
  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword
  const passwordFormValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword

  const rowsPerPageNum = Number.parseInt(rowsPerPage, 10)
  const rowsPerPageInvalid =
    !Number.isInteger(rowsPerPageNum) ||
    rowsPerPageNum < 1 ||
    rowsPerPageNum > MAX_TABLE_ROWS_PER_PAGE
  const rowsPerPageUnchanged =
    !rowsPerPageInvalid &&
    rowsPerPageNum ===
      (currentUser?.tableRowsPerPage ?? DEFAULT_TABLE_ROWS_PER_PAGE)

  // Current session is the most recently created one
  const currentSessionId = sessions.length
    ? sessions.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b,
      ).id
    : null

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account settings"
        description="Manage your personal details and keep your account secure."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security" data-testid="account-tab-security">
            Security
          </TabsTrigger>
          <TabsTrigger value="two-factor" data-testid="account-tab-two-factor">
            Two-factor
          </TabsTrigger>
          <TabsTrigger value="sessions" onClick={loadSessions}>
            Sessions
          </TabsTrigger>
        </TabsList>

        {/* ── Profile ──────────────────────────────────────────────────── */}
        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <form onSubmit={handleNameSubmit} className="contents">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="size-4" />
                    Profile
                  </CardTitle>
                  <CardDescription>
                    Your name is shown across the platform and on your activity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-name">Full name</Label>
                    <Input
                      id="account-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    type="submit"
                    disabled={savingName || nameInvalid || nameUnchanged}
                  >
                    {savingName ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Phone number</CardTitle>
                <CardDescription>
                  Your contact phone number shown on your profile.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {editingPhone ? (
                  <form
                    onSubmit={handlePhoneSubmit}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="account-phone">Phone number</Label>
                      <Input
                        id="account-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01XXXXXXXXX"
                        autoComplete="tel"
                        aria-invalid={phoneInvalid}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingPhone || phoneInvalid || phoneUnchanged}
                      >
                        {savingPhone ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingPhone}
                        onClick={() => {
                          setEditingPhone(false)
                          setPhone(currentUser?.phone ?? "")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      id="account-phone"
                      value={currentUser?.phone ?? ""}
                      disabled
                      readOnly
                      className="max-w-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingPhone(true)}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <form onSubmit={handleEmailSubmit} className="contents">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="size-4" />
                    Email
                  </CardTitle>
                  <CardDescription>
                    This is the email you sign in with — a verification link
                    goes to the new address and only takes effect once you click
                    it. Your business email (shown on receipts) is managed
                    separately and stays unchanged.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-current-email">Current email</Label>
                    <Input
                      id="account-current-email"
                      data-testid="email-change-current"
                      value={currentUser?.email ?? ""}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-new-email">New email</Label>
                    <Input
                      id="account-new-email"
                      data-testid="email-change-input"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      aria-invalid={newEmail.length > 0 && emailInvalid}
                    />
                    {newEmail.length > 0 && emailInvalid ? (
                      <p className="text-destructive text-xs">
                        Enter a valid email address.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    type="submit"
                    data-testid="email-change-submit"
                    disabled={savingEmail || emailInvalid || emailUnchanged}
                  >
                    {savingEmail ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      "Send verification"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Avatar</CardTitle>
                <CardDescription>
                  Upload a profile photo shown next to your name across the
                  platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Avatar className="size-20 shrink-0">
                  {currentUser?.image ? (
                    <AvatarImage
                      src={currentUser.image || "/placeholder.svg"}
                      alt={currentUser.name}
                    />
                  ) : null}
                  <AvatarFallback className="text-xl font-medium sm:text-2xl">
                    {currentUser ? initials(currentUser.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <ImageUpload
                  value={currentUser?.image ?? null}
                  onChange={handleImageChange}
                  folder="avatars"
                  disabled={savingImage}
                  label="Upload photo"
                  hidePreview
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Preferences ──────────────────────────────────────────────── */}
        <TabsContent value="preferences" className="mt-4">
          <Card className="max-w-lg">
            <form onSubmit={handleRowsPerPageSubmit} className="contents">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Table2 className="size-4" />
                  Tables
                </CardTitle>
                <CardDescription>
                  How many rows show per page on tables across the platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Label htmlFor="account-rows-per-page">Rows per page</Label>
                <Input
                  id="account-rows-per-page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TABLE_ROWS_PER_PAGE}
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(e.target.value)}
                  className="max-w-32"
                  aria-invalid={rowsPerPageInvalid}
                />
                <p className="text-muted-foreground text-xs">
                  Between 1 and {MAX_TABLE_ROWS_PER_PAGE}. Default is{" "}
                  {DEFAULT_TABLE_ROWS_PER_PAGE}.
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  type="submit"
                  disabled={
                    savingRowsPerPage ||
                    rowsPerPageInvalid ||
                    rowsPerPageUnchanged
                  }
                >
                  {savingRowsPerPage ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ── Security ─────────────────────────────────────────────────── */}
        <TabsContent value="security" className="mt-4">
          <div className="flex flex-col gap-6">
            <Card className="max-w-lg">
              <form onSubmit={handlePasswordSubmit} className="contents">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="size-4" />
                    Password
                  </CardTitle>
                  <CardDescription>
                    Use at least 8 characters. Changing it signs you out of
                    other devices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={passwordTooShort}
                    />
                    {passwordTooShort ? (
                      <p className="text-destructive text-xs">
                        Must be at least 8 characters.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="confirm-password">
                      Confirm new password
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={passwordMismatch}
                    />
                    {passwordMismatch ? (
                      <p className="text-destructive text-xs">
                        Passwords do not match.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    type="submit"
                    disabled={savingPassword || !passwordFormValid}
                  >
                    {savingPassword ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Updating
                      </>
                    ) : (
                      "Update password"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        </TabsContent>

        {/* ── Two-factor (admin roles) ──────────────────────────────────── */}
        <TabsContent value="two-factor" className="mt-4">
          <TwoFactorSettings />
        </TabsContent>

        {/* ── Sessions ─────────────────────────────────────────────────── */}
        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Active sessions</CardTitle>
                <CardDescription>
                  Devices where you are currently signed in. Revoke any session
                  you don&apos;t recognize.
                </CardDescription>
              </div>
              {sessions.length > 1 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRevokeAllSessions}
                >
                  <LogOut className="size-4" />
                  Revoke all others
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No active sessions found.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sessions.map((session) => {
                    const { icon: DeviceIcon, label } = parseDevice(
                      session.userAgent,
                    )
                    const isCurrent = session.id === currentSessionId
                    return (
                      <div
                        key={session.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <DeviceIcon className="text-muted-foreground size-5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{label}</span>
                            {isCurrent && (
                              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {session.ipAddress ?? "Unknown IP"} &middot;{" "}
                            {formatTimeAgo(session.createdAt)}
                            {session.expiresAt &&
                              ` \u00B7 expires ${formatTimeAgo(session.expiresAt)}`}
                          </p>
                        </div>
                        {!isCurrent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={revokingToken === session.token}
                            onClick={() => handleRevokeSession(session)}
                          >
                            {revokingToken === session.token ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <LogOut className="size-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
