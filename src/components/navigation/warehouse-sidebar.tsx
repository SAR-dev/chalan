"use client"

import { RoleSidebar } from "@/components/navigation/role-sidebar"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { WAREHOUSE_SIDEBAR } from "@/lib/nav-config"

export function WarehouseSidebar() {
  const { currentWarehouse } = useWarehouses()
  return (
    <RoleSidebar
      config={WAREHOUSE_SIDEBAR}
      footerSubtitle={currentWarehouse?.name}
    />
  )
}
