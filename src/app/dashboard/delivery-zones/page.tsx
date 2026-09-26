import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { loginRedirectPath } from "@/lib/login-redirect"
import { DeliveryZonesPageClient } from "./delivery-zones-client"

export default async function DeliveryZonesPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  return <DeliveryZonesPageClient />
}
