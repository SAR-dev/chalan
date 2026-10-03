"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { DataErrorBanner } from "@/components/data-error-banner"
import { MobileHeader } from "@/components/navigation/mobile-header"
import { RiderSidebar } from "@/components/navigation/rider-sidebar"
import { homeForRole, useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementBanner } from "@/features/announcements/components/announcement-banner"
import { loginPathWithNext } from "@/lib/auth-redirect"
import { RIDER_SIDEBAR } from "@/lib/nav-config"

// Rider monitors: riders, orders, merchants, warehouses, pickup-locations.
const RIDER_KEYS = [
  "/api/riders",
  "/api/orders",
  "/api/merchants",
  "/api/warehouses",
  "/api/pickup-locations",
] as const

export function RiderShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser, isReady } = useAuth()

  useEffect(() => {
    if (!isReady) return
    if (!currentUser) {
      router.replace(
        loginPathWithNext(window.location.pathname + window.location.search),
      )
    } else if (currentUser.role !== "RIDER") {
      router.replace(homeForRole(currentUser.role))
    }
  }, [isReady, currentUser, router])

  if (!isReady || !currentUser || currentUser.role !== "RIDER") {
    return (
      // Auth-init placeholder: without a live region a screen reader lands on
      // A blank region with no indication anything is happening.
      <div
        role="status"
        className="bg-background flex min-h-screen items-center justify-center"
      >
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen">
      <RiderSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader config={RIDER_SIDEBAR} />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <AnnouncementBanner />
            <DataErrorBanner keys={RIDER_KEYS} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
