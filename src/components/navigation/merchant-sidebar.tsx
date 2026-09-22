"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { MERCHANT_SIDEBAR } from "@/lib/nav-config"

export function MerchantSidebar() {
  const { currentMerchant } = useMerchants()
  return (
    <RoleSidebar
      config={MERCHANT_SIDEBAR}
      footerSubtitle={currentMerchant?.businessName}
    />
  )
}
