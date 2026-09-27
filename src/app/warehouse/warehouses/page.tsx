import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { loginRedirectPath } from "@/lib/login-redirect"

export default async function WarehouseAdminWarehousesPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role === "WAREHOUSE_ADMIN") redirect("/warehouse")

  // For other roles, dynamically import the client component
  const { default: WarehouseAdminWarehousesPageClient } = await import(
    "./warehouses-client"
  )
  return <WarehouseAdminWarehousesPageClient />
}
