"use client"

import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ImageZoom } from "@/components/image-zoom"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MerchantStatusBadge } from "@/features/merchants/components/merchant-status-badge"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import type { Merchant } from "@/lib/types"

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="outline" className="gap-1 text-green-600">
      <CheckCircle2 className="size-3" />
      Verified
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <XCircle className="size-3" />
      Not verified
    </Badge>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value?: string | null
  icon: React.ComponentType<{ className?: string }>
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-sm">{value}</span>
      </div>
    </div>
  )
}

export function MerchantDetailClient({
  merchant: initialMerchant,
}: {
  merchant: Merchant
}) {
  const { mutate } = useMerchants()
  const [merchant, setMerchant] = useState(initialMerchant)

  const [rejectReason, setRejectReason] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [maxModerators, setMaxModerators] = useState(
    initialMerchant.maxModerators ?? 3,
  )
  const [savingQuota, setSavingQuota] = useState(false)

  async function handleSaveQuota() {
    const value = Number(maxModerators)
    if (!Number.isInteger(value) || value < 0 || value > 20) {
      toast.error("Quota must be a whole number between 0 and 20.")
      return
    }
    setSavingQuota(true)
    try {
      const res = await fetch(`/api/merchants/${merchant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxModerators: value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Could not save the moderator quota.")
        return
      }
      setMerchant((prev) => ({ ...prev, ...data }))
      toast.success(`Moderator quota set to ${value}.`)
      mutate()
    } finally {
      setSavingQuota(false)
    }
  }

  async function handleNidReview(action: "approve" | "reject") {
    if (action === "reject" && !rejectReason.trim()) {
      toast.error("Rejection reason is required")
      return
    }
    setReviewing(true)
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/nid/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "reject" ? { reason: rejectReason.trim() } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Failed to review NID")
        return
      }
      const data = await res.json()
      setMerchant((prev) => ({ ...prev, ...data }))
      toast.success(action === "approve" ? "NID verified" : "NID rejected")
      setRejectReason("")
      mutate()
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={merchant.businessName}
        description="Merchant details and registration information"
      >
        <MerchantStatusBadge status={merchant.status} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4" />
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <DetailRow
                label="Business name"
                value={merchant.businessName}
                icon={Building2}
              />
              <DetailRow
                label="Owner name"
                value={merchant.ownerName}
                icon={User}
              />
              <DetailRow label="Email" value={merchant.email} icon={Mail} />
              <DetailRow label="Phone" value={merchant.phone} icon={Phone} />
              <DetailRow
                label="Address"
                value={merchant.address}
                icon={MapPin}
              />
            </CardContent>
          </Card>

          {/* NID Review Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                NID Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="divide-border divide-y text-sm">
                <div className="flex items-center justify-between py-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {merchant.nidVerifiedAt ? (
                      <Badge variant="outline" className="gap-1 text-green-600">
                        <CheckCircle2 className="size-3" />
                        Verified
                      </Badge>
                    ) : merchant.nidSubmittedAt ? (
                      <Badge variant="secondary">Pending Review</Badge>
                    ) : (
                      <Badge variant="destructive">Not Uploaded</Badge>
                    )}
                  </dd>
                </div>
                {merchant.nidNumber && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">NID Number</dt>
                    <dd className="font-medium tabular-nums">
                      {merchant.nidNumber}
                    </dd>
                  </div>
                )}
                {merchant.nidSubmittedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{formatDate(merchant.nidSubmittedAt)}</dd>
                  </div>
                )}
                {merchant.nidVerifiedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Verified</dt>
                    <dd>
                      {formatDate(merchant.nidVerifiedAt)} by{" "}
                      {merchant.nidVerifiedBy}
                    </dd>
                  </div>
                )}
                {merchant.nidRejectedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Rejected</dt>
                    <dd className="text-destructive">
                      {formatDate(merchant.nidRejectedAt)}
                      {merchant.nidRejectionReason && (
                        <span className="text-muted-foreground ml-1">
                          — {merchant.nidRejectionReason}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {(merchant.nidFrontImage ||
                merchant.nidBackImage ||
                merchant.nidSelfieImage) && (
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs">
                    NID Images
                  </span>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {merchant.nidFrontImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Front
                        </span>
                        <ImageZoom
                          src={merchant.nidFrontImage}
                          alt="NID front"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
                    {merchant.nidBackImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Back
                        </span>
                        <ImageZoom
                          src={merchant.nidBackImage}
                          alt="NID back"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
                    {merchant.nidSelfieImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Selfie
                        </span>
                        <ImageZoom
                          src={merchant.nidSelfieImage}
                          alt="NID selfie"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {merchant.nidSubmittedAt && !merchant.nidVerifiedAt && (
                <div className="flex flex-col gap-2">
                  <Textarea
                    placeholder="Rejection reason (required if rejecting)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reviewing}
                      onClick={() => handleNidReview("approve")}
                    >
                      {reviewing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={reviewing || !rejectReason.trim()}
                      onClick={() => handleNidReview("reject")}
                    >
                      {reviewing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                Verification Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Email verified</span>
                <VerificationBadge
                  verified={Boolean(merchant.emailVerifiedAt)}
                />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="moderator-quota-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Moderator quota
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs">
                Max active + pending staff logins for this merchant (0-20).
                Deactivating a moderator frees a slot.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={maxModerators}
                  onChange={(e) => setMaxModerators(Number(e.target.value))}
                  className="w-24"
                  data-testid="moderator-quota-input"
                  aria-label="Moderator quota"
                />
                <Button
                  size="sm"
                  onClick={handleSaveQuota}
                  disabled={savingQuota}
                  data-testid="moderator-quota-save"
                >
                  {savingQuota ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save quota"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Registered</span>
                <span>{formatDate(merchant.createdAt)}</span>
              </div>
              {merchant.emailVerifiedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email verified</span>
                  <span>{formatDate(merchant.emailVerifiedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Weight limit
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-border divide-y py-0">
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground text-sm">
                  Max parcel weight
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {merchant.maxWeightKg} KG
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
