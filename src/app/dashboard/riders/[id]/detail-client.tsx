"use client"

import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Mail,
  MapPin,
  Phone,
  User,
  XCircle,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { taskTypeLabel } from "@/features/riders/dialogs/task-type"

type RiderData = {
  id: string
  name: string
  email: string
  phone: string
  zone: string
  address: string
  nidNumber: string
  status: string
  isActive: boolean
  taskType: string
  warehouseId: string
  approvedBy: string | null
  approvedAt: string | null
  rejectionReason: string | null
  nidFrontImage: string | null
  nidBackImage: string | null
  nidSelfieImage: string | null
  nidSubmittedAt: string | null
  nidVerifiedAt: string | null
  nidVerifiedBy: string | null
  nidRejectedAt: string | null
  nidRejectedBy: string | null
  nidRejectionReason: string | null
  createdAt: string
  updatedAt: string
  warehouseName: string | null
  warehouseCity: string | null
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, {
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

export function RiderDetailClient({ rider }: { rider: RiderData }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={rider.name}
        description="Rider details and profile information"
      >
        <Badge variant={rider.isActive ? "default" : "secondary"}>
          {rider.isActive ? "Active" : "Inactive"}
        </Badge>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <DetailRow label="Full name" value={rider.name} icon={User} />
              <DetailRow label="Email" value={rider.email} icon={Mail} />
              <DetailRow label="Phone" value={rider.phone} icon={Phone} />
              <DetailRow label="Zone" value={rider.zone} icon={MapPin} />
              <DetailRow label="Address" value={rider.address} icon={MapPin} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-border divide-y py-0">
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground text-sm">Task type</span>
                <Badge variant="secondary" className="font-normal">
                  {taskTypeLabel(
                    rider.taskType as "PICKUP" | "DELIVERY" | "BOTH",
                  )}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground text-sm">
                  Home warehouse
                </span>
                {rider.warehouseName ? (
                  <Badge variant="secondary" className="font-normal">
                    {rider.warehouseName}-{rider.warehouseCity}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    No warehouse
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground text-sm">Status</span>
                <Badge variant="outline" className="gap-1">
                  {rider.isActive ? (
                    <CheckCircle2 className="size-3 text-green-600" />
                  ) : (
                    <XCircle className="size-3 text-muted-foreground" />
                  )}
                  {rider.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* NID Verification */}
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
                    {rider.nidVerifiedAt ? (
                      <Badge variant="outline" className="gap-1 text-green-600">
                        <CheckCircle2 className="size-3" />
                        Verified
                      </Badge>
                    ) : rider.nidSubmittedAt ? (
                      <Badge variant="secondary">Pending Review</Badge>
                    ) : (
                      <Badge variant="destructive">Not Uploaded</Badge>
                    )}
                  </dd>
                </div>
                {rider.nidNumber && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">NID Number</dt>
                    <dd className="font-medium tabular-nums">
                      {rider.nidNumber}
                    </dd>
                  </div>
                )}
                {rider.nidSubmittedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{formatDate(rider.nidSubmittedAt)}</dd>
                  </div>
                )}
                {rider.nidVerifiedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Verified</dt>
                    <dd>
                      {formatDate(rider.nidVerifiedAt)} by {rider.nidVerifiedBy}
                    </dd>
                  </div>
                )}
                {rider.nidRejectedAt && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Rejected</dt>
                    <dd className="text-destructive">
                      {formatDate(rider.nidRejectedAt)}
                      {rider.nidRejectionReason && (
                        <span className="text-muted-foreground ml-1">
                          — {rider.nidRejectionReason}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {(rider.nidFrontImage ||
                rider.nidBackImage ||
                rider.nidSelfieImage) && (
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs">
                    NID Images
                  </span>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {rider.nidFrontImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Front
                        </span>
                        <img
                          src={rider.nidFrontImage}
                          alt="NID front"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
                    {rider.nidBackImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Back
                        </span>
                        <img
                          src={rider.nidBackImage}
                          alt="NID back"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
                    {rider.nidSelfieImage && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Selfie
                        </span>
                        <img
                          src={rider.nidSelfieImage}
                          alt="NID selfie"
                          className="rounded-lg border object-cover aspect-video h-full"
                        />
                      </div>
                    )}
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
                Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="gap-1">
                  {rider.status}
                </Badge>
              </div>
              {rider.approvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Approved by</span>
                  <span>{rider.approvedBy}</span>
                </div>
              )}
              {rider.rejectionReason && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">
                    Rejection reason
                  </span>
                  <span className="text-destructive">
                    {rider.rejectionReason}
                  </span>
                </div>
              )}
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
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(rider.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(rider.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
