import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { loginRedirectPath } from "@/lib/login-redirect"
import { ZoneDeliveryTimePageClient } from "./zone-delivery-time-client"

export default async function ZoneDeliveryTimePage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  return <ZoneDeliveryTimePageClient />
}
