"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { RIDER_SIDEBAR } from "@/lib/nav-config"

export function RiderSidebar() {
  const { currentRider } = useRiders()
  return (
    <RoleSidebar config={RIDER_SIDEBAR} footerSubtitle={currentRider?.zone} />
  )
}
