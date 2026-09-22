"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { useAuth } from "@/features/account/hooks/use-auth"
import { dashboardSidebarForRole } from "@/lib/nav-config"

export function Sidebar() {
  const { currentUser } = useAuth()

  return (
    <RoleSidebar
      config={dashboardSidebarForRole(currentUser?.role)}
      fallbackName="Super Admin"
      fallbackInitials="SA"
    />
  )
}
