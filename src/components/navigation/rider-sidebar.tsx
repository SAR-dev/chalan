"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { RIDER_SIDEBAR } from "@/lib/nav-config"

export function RiderSidebar() {
  return <RoleSidebar config={RIDER_SIDEBAR} />
}
