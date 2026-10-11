"use client"

import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { Sidebar } from "@/components/navigation/sidebar"
import { TopNav } from "@/components/navigation/top-nav"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { loginPathWithNext } from "@/lib/auth-redirect"
import { dashboardSidebarForRole } from "@/lib/nav-config"
import { twoFactorEnforcementPath } from "@/lib/two-factor"
import type { AppVersion } from "@/lib/version"

// Dashboard (Super Admin / Admin) monitors all resources.
const DASHBOARD_KEYS = [
  "/api/team",
  "/api/merchants",
  "/api/orders",
  "/api/payouts",
  "/api/pickup-locations",
  "/api/riders",
  "/api/warehouses",
  "/api/audit-logs",
  "/api/email-logs",
] as const

export function DashboardShell({
  children,
  version,
}: {
  children: React.ReactNode
  /** Build version, read in the server layout and shown by TopNav. */
  version?: AppVersion
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser, isReady } = useAuth()

  // — while "require 2FA for admins" is on, admins without an
  // enrolment are parked on their account page until they set one up.
  const twoFactorSetupPath = currentUser
    ? twoFactorEnforcementPath({
        role: currentUser.role,
        twoFactorEnabled: currentUser.twoFactorEnabled,
        twoFactorRequired: currentUser.twoFactorRequired,
        pathname,
      })
    : null

  useEffect(() => {
    if (!isReady) return
    if (!currentUser) {
      router.replace(loginPathWithNext(pathname + window.location.search))
    } else if (currentUser.role !== "SUPER_ADMIN") {
      router.replace(homeForRole(currentUser.role))
    } else if (twoFactorSetupPath) {
      router.replace(twoFactorSetupPath)
    }
  }, [isReady, currentUser, router, twoFactorSetupPath])

  if (
    !isReady ||
    !currentUser ||
    currentUser.role !== "SUPER_ADMIN" ||
    twoFactorSetupPath
  ) {
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

  return (
    <div className="bg-background flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          version={version}
          config={dashboardSidebarForRole(currentUser.role)}
        />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <DataErrorBanner keys={DASHBOARD_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
