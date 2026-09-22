"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { MobileHeader } from "@/components/navigation/mobile-header"
import { Sidebar } from "@/components/navigation/sidebar"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementBanner } from "@/features/announcements/components/announcement-banner"
import { dashboardSidebarForRole } from "@/lib/nav-config"

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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser, isReady } = useAuth()

  useEffect(() => {
    if (!isReady) return
    if (!currentUser) {
      router.replace("/login")
    } else if (currentUser.role !== "SUPER_ADMIN") {
      router.replace(homeForRole(currentUser.role))
    }
  }, [isReady, currentUser, router])

  if (!isReady || !currentUser || currentUser.role !== "SUPER_ADMIN") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader config={dashboardSidebarForRole(currentUser.role)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">
            <AnnouncementBanner />
            <DataErrorBanner keys={DASHBOARD_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
