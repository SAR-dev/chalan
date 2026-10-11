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
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { MerchantSidebar } from "@/components/navigation/merchant-sidebar"
import { TopNav } from "@/components/navigation/top-nav"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { loginPathWithNext } from "@/lib/auth-redirect"
import {
  isNavItemActive,
  MERCHANT_SIDEBAR,
  merchantVisibleNavItems,
} from "@/lib/nav-config"
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
    border: "border-chart-1/25",
    bg: "bg-chart-1/10",
    icon: "text-chart-1",
    title: "text-chart-1",
    desc: "text-muted-foreground",
  },
  red: {
    border: "border-destructive/25",
    bg: "bg-destructive/10",
    icon: "text-destructive",
    title: "text-destructive",
    desc: "text-muted-foreground",
  },
  amber: {
    border: "border-chart-3/25",
    bg: "bg-chart-3/10",
    icon: "text-chart-3",
    title: "text-chart-3",
    desc: "text-muted-foreground",
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
        className="shrink-0 self-start sm:self-auto border border-base/20 w-32"
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
      className="border-chart-3/25 bg-chart-3/10 mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
    >
      <span className="text-chart-3">
        Add a pickup location to start creating orders.
      </span>
      <Button
        variant="secondary"
        size="sm"
        render={<Link href="/merchant/settings" />}
        nativeButton={false}
        className="border border-base/20 w-32"
      >
        <PlusIcon className="size-4" />
        Add
      </Button>
    </div>
  )
}

export function MerchantShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser, isReady } = useAuth()
  const { currentMerchant, isLoading: isMerchantLoading } = useMerchants()
  const { pickupLocations, isLoading: isPickupLocationsLoading } =
    usePickupLocations()
  // Filtered nav for TopNav (moderators see granted items only). Hooks
  // must stay above the early returns below — React error #310 otherwise.
  const navConfig = useMemo(
    () => ({
      ...MERCHANT_SIDEBAR,
      items: merchantVisibleNavItems(currentUser),
    }),
    [currentUser],
  )

  useEffect(() => {
    if (!isReady) return
    if (!currentUser) {
      router.replace(
        loginPathWithNext(window.location.pathname + window.location.search),
      )
    } else if (currentUser.role !== "MERCHANT") {
      router.replace("/dashboard")
    } else if (isMerchantLoading || !currentMerchant) {
      // Wait for merchant data to load before deciding redirect
      return
    }
  }, [isReady, currentUser, currentMerchant, isMerchantLoading, router])

  // Moderator route guard: a moderator
  // who opens a non-granted /merchant route is sent to their landing page.
  // The nav already renders only granted items; this closes direct URLs.
  useEffect(() => {
    if (!currentUser?.isModerator || !pathname) return
    if (pathname !== "/merchant" && !pathname.startsWith("/merchant/")) return
    const items = merchantVisibleNavItems(currentUser)
    const allowed = items.some((item) => isNavItemActive(item, pathname))
    if (!allowed) {
      router.replace(items[0]?.href ?? "/merchant")
    }
  }, [currentUser, pathname, router])

  if (!isReady || !currentUser || currentUser.role !== "MERCHANT") {
    return (
      // Auth-init placeholder: without a live region a screen reader lands on
      // A blank region with no indication anything is happening.
      <div
        role="status"
        className="bg-background flex min-h-dvh items-center justify-center"
      >
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  const isActive = currentMerchant?.status === "ACTIVE"
  const hasPickupLocations = pickupLocations.some(
    (p) => p.merchantId === currentMerchant?.id,
  )

  return (
    <div className="bg-background flex min-h-dvh" data-testid="merchant-portal">
      <MerchantSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          config={navConfig}
          subtitle={currentMerchant?.businessName ?? null}
          businessName={currentMerchant?.businessName ?? undefined}
        />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
        >
          <div className="mx-auto w-full max-w-6xl">
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
