"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { WAREHOUSE_SIDEBAR } from "@/lib/nav-config"

export function WarehouseSidebar() {
  return <RoleSidebar config={WAREHOUSE_SIDEBAR} />
}
