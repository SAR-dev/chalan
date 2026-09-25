"use client"

import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { MobileHeader } from "@/components/navigation/mobile-header"
import { WarehouseSidebar } from "@/components/navigation/warehouse-sidebar"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementBanner } from "@/features/announcements/components/announcement-banner"
import { WAREHOUSE_SIDEBAR } from "@/lib/nav-config"
import { twoFactorEnforcementPath } from "@/lib/two-factor"

// Warehouse Admin monitors: warehouses, orders, merchants, riders, pickup-locations.
const WAREHOUSE_KEYS = [
  "/api/warehouses",
  "/api/orders",
  "/api/merchants",
  "/api/riders",
  "/api/pickup-locations",
] as const

export function WarehouseShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser, isReady } = useAuth()

  // ROADMAP H4 — same gate as the dashboard shell, against the warehouse
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
      router.replace("/login")
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
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen">
      <WarehouseSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader config={WAREHOUSE_SIDEBAR} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">
            <AnnouncementBanner />
            <DataErrorBanner keys={WAREHOUSE_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
