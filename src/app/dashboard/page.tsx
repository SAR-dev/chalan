import { eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import {
  mailConfig,
  merchant,
  order,
  profile,
  rider,
  warehouse,
} from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { OverviewPageClient } from "./overview-client"

export default async function OverviewPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const [
    [{ warehouseAdminCount }],
    [{ totalWarehouses, activeWarehouses }],
    [{ pendingMerchants }],
    [{ pendingOrders }],
    [{ pendingRiders }],
    [{ activeMailConfigCount }],
  ] = await Promise.all([
    dbRead
      .select({ warehouseAdminCount: sql<number>`count(*)::int` })
      .from(profile)
      .where(eq(profile.role, "WAREHOUSE_ADMIN")),
    dbRead
      .select({
        totalWarehouses: sql<number>`count(*)::int`,
        activeWarehouses: sql<number>`count(*) filter (where ${warehouse.isActive} = true)::int`,
      })
      .from(warehouse),
    dbRead
      .select({ pendingMerchants: sql<number>`count(*)::int` })
      .from(merchant)
      .where(eq(merchant.status, "PENDING")),
    dbRead
      .select({ pendingOrders: sql<number>`count(*)::int` })
      .from(order)
      .where(eq(order.status, "PENDING")),
    dbRead
      .select({ pendingRiders: sql<number>`count(*)::int` })
      .from(rider)
      .where(eq(rider.status, "PENDING")),
    dbRead
      .select({
        activeMailConfigCount: sql<number>`count(*)::int`,
      })
      .from(mailConfig)
      .where(eq(mailConfig.isActive, true)),
  ])

  return (
    <OverviewPageClient
      userName={me.name?.split(" ")[0] ?? "Admin"}
      warehouseAdminCount={warehouseAdminCount}
      totalWarehouses={totalWarehouses}
      activeWarehouses={activeWarehouses}
      pendingMerchants={pendingMerchants}
      pendingOrders={pendingOrders}
      pendingRiders={pendingRiders}
      hasActiveMailConfig={activeMailConfigCount > 0}
    />
  )
}
