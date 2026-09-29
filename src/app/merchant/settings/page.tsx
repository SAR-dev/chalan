"use client"

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Palette,
  PanelLeft,
  Phone,
  Store,
  Tag,
  User,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FormErrors } from "@/components/form-errors"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { MerchantStatusBadge } from "@/features/merchants/components/merchant-status-badge"
import { ModeratorsCard } from "@/features/merchants/components/moderators-card"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { PickupLocationsManager } from "@/features/pickup-locations/components/pickup-locations-manager"
import { brandThemeVars, lowContrastSides } from "@/lib/brand-color"
import { merchantProfileSchema, validateFormData } from "@/lib/validation"

const BRAND_PRESETS = [
  { label: "Orange", value: "#f97316" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#10b981" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Red", value: "#ef4444" },
  { label: "Cyan", value: "#06b6d4" },
] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function PricingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function MerchantSettingsPage() {
  const { isReady } = useAuth()
  const {
    currentMerchant,
    updateMerchantProfile,
    isLoading: merchantsLoading,
  } = useMerchants()
  const isDataReady = !merchantsLoading

  const [businessName, setBusinessName] = useState(
    () => currentMerchant?.businessName ?? "",
  )
  const [phone, setPhone] = useState(() => currentMerchant?.phone ?? "")
  const [address, setAddress] = useState(() => currentMerchant?.address ?? "")
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Branding state
  const [brandColor, setBrandColor] = useState(
    () => currentMerchant?.brandColor ?? "",
  )
  const [hidePlatformBranding, setHidePlatformBranding] = useState(
    () => currentMerchant?.hidePlatformBranding ?? false,
  )
  const [savingBranding, setSavingBranding] = useState(false)

  // Live preview + WCAG warning (warn, never block) — reflect unsaved edits.
  const previewVars = brandThemeVars(brandColor)
  const lowContrast = lowContrastSides(brandColor)
  const contrastSides =
    lowContrast.length === 2
      ? "light and dark"
      : lowContrast[0] === "light"
        ? "light"
        : "dark"
  const contrastMessage =
    lowContrast.length > 0
      ? `Low contrast: this color as text on ${contrastSides} backgrounds is under the WCAG AA 4.5:1 threshold. Buttons and badges using it as a background stay readable.`
      : null

  useEffect(() => {
    if (!currentMerchant) return
    setBusinessName(currentMerchant.businessName)
    setPhone(currentMerchant.phone)
    setAddress(currentMerchant.address)
    setBrandColor(currentMerchant.brandColor ?? "")
    setHidePlatformBranding(currentMerchant.hidePlatformBranding ?? false)
  }, [currentMerchant])

  if (!isReady || !isDataReady) return null

  if (!currentMerchant) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={pageContent.merchant.business.title}
          description={pageContent.merchant.business.missingDescription}
        />
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            We couldn&apos;t find a business linked to your account.
          </CardContent>
        </Card>
      </div>
    )
  }

  const trimmed = {
    businessName: businessName.trim(),
    email: currentMerchant.email,
    phone: phone.trim(),
    address: address.trim(),
  }

  const requiredFilled =
    trimmed.businessName.length > 0 &&
    trimmed.phone.length > 0 &&
    trimmed.address.length > 0
  const unchanged =
    trimmed.businessName === currentMerchant.businessName &&
    trimmed.phone === currentMerchant.phone &&
    trimmed.address === currentMerchant.address
  const formValid = requiredFilled && !unchanged

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentMerchant) return
    const fieldErrors = validateFormData(merchantProfileSchema, {
      businessName: trimmed.businessName,
      email: trimmed.email,
      phone: trimmed.phone,
      address: trimmed.address,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    if (!formValid) return
    setSaving(true)
    try {
      const result = await updateMerchantProfile(currentMerchant.id, {
        businessName: trimmed.businessName,
        email: trimmed.email,
        phone: trimmed.phone,
        address: trimmed.address,
      })
      if (result.ok) {
        toast.success("Your business details have been updated.")
      } else {
        toast.error(result.error ?? "Could not update your business details.")
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveBranding() {
    if (!currentMerchant) return
    setSavingBranding(true)
    try {
      const res = await fetch(`/api/merchants/${currentMerchant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandColor: brandColor || null,
          hidePlatformBranding,
        }),
      })
      if (res.ok) {
        toast.success("Branding settings saved.")
        // Revalidate merchant data
        window.location.reload()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? "Could not save branding settings.")
      }
    } finally {
      setSavingBranding(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.merchant.business.title}
        description={pageContent.merchant.business.description}
      >
        <MerchantStatusBadge status={currentMerchant.status} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-6">
            <form onSubmit={handleSubmit} className="contents">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4" />
                    Business details
                  </CardTitle>
                  <CardDescription>
                    These details appear on pickups, labels, and merchant
                    communications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormErrors
                    errors={Object.keys(errors).length > 0 ? errors : null}
                    className="sm:col-span-2"
                  />

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="business-name">Business name</Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your business name"
                      aria-invalid={trimmed.businessName.length === 0}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="business-phone">Phone</Label>
                    <Input
                      id="business-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      autoComplete="tel"
                      aria-invalid={trimmed.phone.length === 0}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="business-address">Address</Label>
                    <Textarea
                      id="business-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, area, city"
                      rows={3}
                      aria-invalid={trimmed.address.length === 0}
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button type="submit" disabled={saving || !formValid}>
                    {saving ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <Card data-testid="branding-section">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="size-4" />
                  Branding
                </CardTitle>
                <CardDescription>
                  Customize how your business appears in the sidebar, order
                  tracking, and emails.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Live preview — uses unsaved values via inline theme vars */}
                <div
                  className="border-border bg-card rounded-lg border p-4"
                  style={previewVars as React.CSSProperties | undefined}
                  data-testid="branding-preview"
                >
                  <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-widest uppercase">
                    Preview
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {currentMerchant.businessName}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium"
                          data-testid="preview-chip"
                        >
                          Badge
                        </span>
                        <button
                          type="button"
                          className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-xs font-medium"
                          data-testid="preview-button"
                        >
                          Sample button
                        </button>
                        <span className="text-primary text-xs font-medium underline underline-offset-4">
                          Link
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-border mt-4 border-t pt-3">
                    <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                      Where this appears:
                    </p>
                    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <li className="flex items-center gap-1.5">
                        <PanelLeft className="size-3.5" />
                        Merchant sidebar
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Store className="size-3.5" />
                        Order tracking page
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Mail className="size-3.5" />
                        Customer emails
                      </li>
                    </ul>
                  </div>

                  {contrastMessage && (
                    <div
                      className="border-amber-500/30 bg-amber-500/10 mt-3 flex items-start gap-2 rounded-md border px-3 py-2"
                      data-testid="brand-contrast-warning"
                    >
                      <AlertTriangle className="text-amber-600 mt-0.5 size-3.5 shrink-0" />
                      <p className="text-amber-700 text-xs leading-relaxed">
                        {contrastMessage}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Brand color</Label>
                  <p className="text-muted-foreground text-xs">
                    Applied to buttons, links, badges, and focus rings across
                    your portal.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {BRAND_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        title={preset.label}
                        onClick={() => setBrandColor(preset.value)}
                        className={`size-8 rounded-full border-2 transition-all ${
                          brandColor === preset.value
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: preset.value }}
                      />
                    ))}
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={brandColor || "#f97316"}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="size-8 cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-md"
                      />
                      <Input
                        type="text"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        placeholder="#f97316"
                        className="w-24 font-mono text-xs"
                        maxLength={7}
                        data-testid="brand-color-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label>Hide platform branding</Label>
                    <p className="text-muted-foreground text-xs">
                      Show only your logo in the sidebar, hiding the platform
                      name.
                    </p>
                  </div>
                  <Switch
                    checked={hidePlatformBranding}
                    onCheckedChange={setHidePlatformBranding}
                    data-testid="hide-branding-toggle"
                  />
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  onClick={handleSaveBranding}
                  disabled={savingBranding}
                  data-testid="save-branding"
                >
                  {savingBranding ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save branding"
                  )}
                </Button>
              </CardFooter>
            </Card>

            <ModeratorsCard merchantId={currentMerchant.id} />

            <PickupLocationsManager merchantId={currentMerchant.id} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" />
                Account owner
              </CardTitle>
              <CardDescription>
                Set at registration and managed by the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="text-muted-foreground size-4 shrink-0" />
                <span className="font-medium">{currentMerchant.ownerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="text-muted-foreground size-4 shrink-0" />
                <span>{currentMerchant.phone}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span className="leading-snug">{currentMerchant.address}</span>
              </div>
              <div className="border-border mt-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    Email verified
                  </span>
                  {currentMerchant.emailVerifiedAt ? (
                    <Badge variant="outline" className="gap-1 text-green-600">
                      <CheckCircle2 className="size-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="size-3" />
                      Not verified
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  Registered
                </span>
                <span className="text-xs">
                  {formatDate(currentMerchant.createdAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                NID Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  NID Status
                </span>
                {currentMerchant.nidVerifiedAt ? (
                  <Badge variant="outline" className="gap-1 text-green-600">
                    <CheckCircle2 className="size-3" />
                    Verified
                  </Badge>
                ) : currentMerchant.nidSubmittedAt ? (
                  <Badge variant="secondary" className="gap-1">
                    Under Review
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    Not Uploaded
                  </Badge>
                )}
              </div>
              {currentMerchant.nidRejectedAt && (
                <p className="text-xs text-red-600">
                  {currentMerchant.nidRejectionReason ||
                    "NID was rejected. Please re-upload."}
                </p>
              )}
              {!currentMerchant.nidVerifiedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/merchant/verify-nid" />}
                  nativeButton={false}
                >
                  {currentMerchant.nidSubmittedAt
                    ? "Re-upload NID"
                    : "Upload NID"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="size-4" />
                Weight limit
              </CardTitle>
              <CardDescription>
                Set by the platform. Contact an admin to make changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-border divide-y py-0">
              <PricingRow
                label="Max parcel weight"
                value={`${currentMerchant.maxWeightKg} KG`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
