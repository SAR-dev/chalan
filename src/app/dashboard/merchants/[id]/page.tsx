import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { MerchantDetailClient } from "./detail-client"

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())

  const { id } = await params

  const [foundMerchant] = await dbRead
    .select()
    .from(merchant)
    .where(eq(merchant.id, id))
    .limit(1)

  if (!foundMerchant) notFound()

  return <MerchantDetailClient merchant={foundMerchant} />
}
