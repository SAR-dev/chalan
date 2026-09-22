import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { ZonePricingPageClient } from "./zone-pricing-client"

export default async function ZonePricingPage() {
  const me = await requireSession()
  if (!me) redirect("/login")
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  return <ZonePricingPageClient />
}
