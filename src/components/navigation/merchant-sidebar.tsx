"use client"

import { useMemo } from "react"
import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { MERCHANT_SIDEBAR, merchantVisibleNavItems } from "@/lib/nav-config"

export function MerchantSidebar() {
  const { currentMerchant } = useMerchants()
  const { currentUser } = useAuth()
  // Moderators only see granted sections; the owner sees the full nav.
  const config = useMemo(
    () => ({
      ...MERCHANT_SIDEBAR,
      items: merchantVisibleNavItems(currentUser),
    }),
    [currentUser],
  )
  return (
    <RoleSidebar
      config={config}
      businessName={currentMerchant?.businessName ?? undefined}
    />
  )
}
