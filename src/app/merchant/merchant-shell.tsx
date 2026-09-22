"use client"

import {
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  PlusIcon,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { MerchantSidebar } from "@/components/navigation/merchant-sidebar"
import { MobileHeader } from "@/components/navigation/mobile-header"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementBanner } from "@/features/announcements/components/announcement-banner"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { MERCHANT_SIDEBAR } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

// Merchant monitors: merchants, orders, pickup-locations.
const MERCHANT_KEYS = [
  "/api/merchants",
  "/api/orders",
  "/api/pickup-locations",
] as const

type Merchant = NonNullable<ReturnType<typeof useMerchants>["currentMerchant"]>
type NidStatus = "verified" | "pending" | "rejected" | "required"

function getNidStatus(m: Merchant): NidStatus {
  if (m.nidVerifiedAt) return "verified"
  if (m.nidRejectedAt) return "rejected"
  if (m.nidSubmittedAt) return "pending"
  return "required"
}

const NID_COLORS = {
  blue: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    icon: "text-blue-600",
    title: "text-blue-800",
    desc: "text-blue-600",
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50",
    icon: "text-red-600",
    title: "text-red-800",
    desc: "text-red-600",
  },
  amber: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    icon: "text-amber-600",
    title: "text-amber-800",
    desc: "text-amber-600",
  },
} as const

const NID_ALERT_CONFIG: Record<
  Exclude<NidStatus, "verified">,
  {
    icon: typeof AlertTriangle
    color: keyof typeof NID_COLORS
    title: string
    description: (m: Merchant) => string
    cta: string
    ctaIcon?: typeof FileText
    buttonVariant: "secondary"
  }
> = {
  pending: {
    icon: Clock,
    color: "blue",
    title: "NID verification pending",
    description: () =>
      "Your NID has been submitted and is being reviewed. You can create orders once it is verified.",
    cta: "View status",
    buttonVariant: "secondary",
  },
  rejected: {
    icon: XCircle,
    color: "red",
    title: "NID verification failed",
    description: (m) =>
      m.nidRejectionReason ||
      "Your NID was rejected. Please re-upload to continue creating orders.",
    cta: "Re-upload NID",
    buttonVariant: "secondary",
  },
  required: {
    icon: AlertTriangle,
    color: "amber",
    title: "NID upload required",
    description: () =>
      "Upload your National ID to start creating orders. This is a one-time verification.",
    cta: "Upload NID",
    ctaIcon: FileText,
    buttonVariant: "secondary",
  },
}

function MerchantNidAlert({ merchant }: { merchant: Merchant }) {
  const status = getNidStatus(merchant)
  if (status === "verified") return null

  const config = NID_ALERT_CONFIG[status]
  const colors = NID_COLORS[config.color]
  const Icon = config.icon
  const CtaIcon = config.ctaIcon

  return (
    <div
      role="alert"
      className={cn(
        "mb-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        colors.border,
        colors.bg,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", colors.icon)} />
        <div>
          <p className={cn("font-medium", colors.title)}>{config.title}</p>
          <p className={cn("text-sm", colors.desc)}>
            {config.description(merchant)}
          </p>
        </div>
      </div>
      <Button
        variant={config.buttonVariant}
        size="sm"
        render={<Link href="/merchant/verify-nid" />}
        nativeButton={false}
        className="shrink-0 self-start sm:self-auto"
      >
        {CtaIcon && <CtaIcon className="size-4" />}
        {config.cta}
      </Button>
    </div>
  )
}

function MerchantPickupLocationAlert() {
  return (
    <div
      role="alert"
      className="border-amber-200 bg-amber-50 mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
    >
      <span className="text-amber-800">
        ⚠️ Add a pickup location to start creating orders.
      </span>
      <Button
        variant="secondary"
        size="sm"
        render={<Link href="/merchant/settings" />}
        nativeButton={false}
      >
        <PlusIcon className="size-4" />
        Add
      </Button>
    </div>
  )
}

export function MerchantShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser, isReady } = useAuth()
  const { currentMerchant, isLoading: isMerchantLoading } = useMerchants()
  const { pickupLocations, isLoading: isPickupLocationsLoading } =
    usePickupLocations()

  useEffect(() => {
    if (!isReady) return
    if (!currentUser) {
      router.replace("/login")
    } else if (currentUser.role !== "MERCHANT") {
      router.replace("/dashboard")
    }
  }, [isReady, currentUser, router])

  if (!isReady || !currentUser || currentUser.role !== "MERCHANT") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  const isActive = currentMerchant?.status === "ACTIVE"
  const hasPickupLocations = pickupLocations.some(
    (p) => p.merchantId === currentMerchant?.id,
  )

  return (
    <div className="bg-background flex min-h-screen">
      <MerchantSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader config={MERCHANT_SIDEBAR} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">
            <AnnouncementBanner />
            {!isMerchantLoading && currentMerchant && (
              <MerchantNidAlert merchant={currentMerchant} />
            )}
            {!isPickupLocationsLoading && !hasPickupLocations && isActive && (
              <MerchantPickupLocationAlert />
            )}
            <DataErrorBanner keys={MERCHANT_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
