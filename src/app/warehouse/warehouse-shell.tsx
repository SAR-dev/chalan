"use client"

import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { TopNav } from "@/components/navigation/top-nav"
import { WarehouseSidebar } from "@/components/navigation/warehouse-sidebar"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { loginPathWithNext } from "@/lib/auth-redirect"
import { WAREHOUSE_SIDEBAR } from "@/lib/nav-config"
import { twoFactorEnforcementPath } from "@/lib/two-factor"
import type { AppVersion } from "@/lib/version"

// Warehouse Admin monitors: warehouses, orders, merchants, riders, pickup-locations.
const WAREHOUSE_KEYS = [
  "/api/warehouses",
  "/api/orders",
  "/api/merchants",
  "/api/riders",
  "/api/pickup-locations",
] as const

export function WarehouseShell({
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
  // The warehouse name moved here from the sidebar footer — TopNav shows it
  // as the RightNav panel's subtitle.
  const { currentWarehouse } = useWarehouses()

  // — same gate as the dashboard shell, against the warehouse
  // account page (/warehouse/account).
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
    } else if (currentUser.role !== "WAREHOUSE_ADMIN") {
      router.replace(homeForRole(currentUser.role))
    } else if (twoFactorSetupPath) {
      router.replace(twoFactorSetupPath)
    }
  }, [isReady, currentUser, router, twoFactorSetupPath])

  if (
    !isReady ||
    !currentUser ||
    currentUser.role !== "WAREHOUSE_ADMIN" ||
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
      <WarehouseSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          version={version}
          config={WAREHOUSE_SIDEBAR}
          subtitle={currentWarehouse?.name}
        />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <DataErrorBanner keys={WAREHOUSE_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
