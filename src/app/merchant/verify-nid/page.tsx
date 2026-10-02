"use client"

import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ImageUpload } from "@/components/image-upload"
import { ImageZoom } from "@/components/image-zoom"
import { PageHeader } from "@/components/page-header"
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
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { formatDateTime } from "@/lib/format"

function formatDate(dateStr: string) {
  return formatDateTime(dateStr, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function VerifyNidPage() {
  const router = useRouter()
  const { currentMerchant, isCurrentMerchantLoading, mutate } = useMerchants()

  const [frontImage, setFrontImage] = useState<string | null>(null)
  const [backImage, setBackImage] = useState<string | null>(null)
  const [selfieImage, setSelfieImage] = useState<string | null>(null)
  const [nidNumber, setNidNumber] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (isCurrentMerchantLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  if (!currentMerchant) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Verify your identity" />
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Merchant account not found.
          </CardContent>
        </Card>
      </div>
    )
  }

  const m = currentMerchant
  const isVerified = Boolean(m.nidVerifiedAt)
  const isPending =
    Boolean(m.nidSubmittedAt) && !m.nidVerifiedAt && !m.nidRejectedAt
  const isRejected = Boolean(m.nidRejectedAt)

  async function handleSubmit() {
    if (!frontImage && !m.nidFrontImage) {
      toast.error("Please upload the front of your NID")
      return
    }
    if (!backImage && !m.nidBackImage) {
      toast.error("Please upload the back of your NID")
      return
    }
    if (!selfieImage && !m.nidSelfieImage) {
      toast.error("Please upload a selfie with your NID")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/merchants/${m.id}/nid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nidFrontImage: frontImage || m.nidFrontImage,
          nidBackImage: backImage || m.nidBackImage,
          nidSelfieImage: selfieImage || m.nidSelfieImage,
          nidNumber: nidNumber || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Failed to submit NID")
        return
      }
      toast.success("NID submitted for review")
      mutate()
      router.push("/merchant")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verify your identity"
        description="Upload your National ID (NID) to start creating orders"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            NID Verification
          </CardTitle>
          <CardDescription>
            Upload clear photos of the front and back of your National ID, plus
            a selfie holding your NID, and enter your NID number.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Status banner */}
          {isVerified && (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="size-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  NID Verified
                </p>
                <p className="text-xs text-green-600">
                  Verified on {formatDate(m.nidVerifiedAt!)}
                </p>
              </div>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Clock className="size-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  Under Review
                </p>
                <p className="text-xs text-blue-600">
                  Your NID has been submitted and is being reviewed by our team.
                  Submitted on {formatDate(m.nidSubmittedAt!)}.
                </p>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <XCircle className="size-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">NID Rejected</p>
                <p className="text-xs text-red-600">
                  {m.nidRejectionReason || "Please re-upload your NID."}
                </p>
                <p className="text-xs text-red-500">
                  Rejected on {formatDate(m.nidRejectedAt!)}
                </p>
              </div>
            </div>
          )}

          {/* Upload fields */}
          {!isVerified && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                {/* 3-image grid */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <Label>Front of NID</Label>
                    <ImageUpload
                      value={frontImage || m.nidFrontImage}
                      onChange={setFrontImage}
                      folder="nids"
                      disabled={isPending}
                      label="Upload front"
                      className="h-64"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Back of NID</Label>
                    <ImageUpload
                      value={backImage || m.nidBackImage}
                      onChange={setBackImage}
                      folder="nids"
                      disabled={isPending}
                      label="Upload back"
                      className="h-64"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Selfie with NID</Label>
                    <ImageUpload
                      value={selfieImage || m.nidSelfieImage}
                      onChange={setSelfieImage}
                      folder="nids"
                      disabled={isPending}
                      label="Upload selfie"
                      className="h-64"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="nid-number">NID Number</Label>
                  <Input
                    id="nid-number"
                    type="text"
                    value={nidNumber || m.nidNumber || ""}
                    onChange={(e) => setNidNumber(e.target.value)}
                    placeholder="Enter your NID number"
                    disabled={isPending}
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    isPending ||
                    (!frontImage && !m.nidFrontImage) ||
                    (!backImage && !m.nidBackImage) ||
                    (!selfieImage && !m.nidSelfieImage)
                  }
                  className="w-full sm:w-auto"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Submitting...
                    </>
                  ) : isRejected ? (
                    "Re-submit for Review"
                  ) : (
                    "Submit for Review"
                  )}
                </Button>
              </div>

              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="size-4" />
                      Verification Requirements
                    </CardTitle>
                    <CardDescription>
                      Please ensure the following before submitting.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          Upload a <strong>clear, full-size</strong> photo of
                          the <strong>front</strong> of your National ID card.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          Upload a <strong>clear photo</strong> of the{" "}
                          <strong>back</strong> of your National ID card.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          Upload a <strong>selfie</strong> holding your NID —
                          your face and the NID must both be clearly visible.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          All <strong>text and photos</strong> on the NID must
                          be fully visible and legible — no cropping or blur.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          The <strong>NID number</strong> you enter must match
                          exactly what is printed on the card.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          Use an <strong>original photo</strong> — screenshots
                          or photocopies are not accepted.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        <span>
                          NID must be <strong>currently valid</strong> (not
                          expired).
                        </span>
                      </li>
                    </ul>
                    <p className="text-muted-foreground mt-4 text-xs">
                      Review typically takes 1–2 business days. You can still
                      browse the dashboard while pending.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Already verified — show images */}
          {isVerified && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">NID Images</span>
              <div className="grid gap-4 sm:grid-cols-3">
                {m.nidFrontImage && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Front</span>
                    <ImageZoom
                      src={m.nidFrontImage}
                      alt="NID front"
                      className="rounded-lg border object-cover aspect-video"
                    />
                  </div>
                )}
                {m.nidBackImage && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Back</span>
                    <ImageZoom
                      src={m.nidBackImage}
                      alt="NID back"
                      className="rounded-lg border object-cover aspect-video"
                    />
                  </div>
                )}
                {m.nidSelfieImage && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">
                      Selfie
                    </span>
                    <ImageZoom
                      src={m.nidSelfieImage}
                      alt="NID selfie"
                      className="rounded-lg border object-cover aspect-video"
                    />
                  </div>
                )}
              </div>
              {m.nidNumber && (
                <span className="text-muted-foreground text-sm">
                  NID Number: {m.nidNumber}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isVerified && !isPending && (
        <Button
          variant="outline"
          render={<Link href="/merchant" />}
          nativeButton={false}
        >
          Skip for now
        </Button>
      )}
    </div>
  )
}
