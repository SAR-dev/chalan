import { desc, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { SupportPageClient } from "@/features/support/components/support-page-client"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { supportTicket } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"

export default async function MerchantSupportPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "MERCHANT") redirect("/login")

  const limit = 20
  const scope = eq(supportTicket.userId, me.userId)

  const [[{ total }], rows] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(supportTicket)
      .where(scope),
    dbRead
      .select()
      .from(supportTicket)
      .where(scope)
      .orderBy(desc(supportTicket.createdAt))
      .limit(limit),
  ])

  return (
    <SupportPageClient
      isAdmin={false}
      initialData={rows}
      initialTotal={total}
    />
  )
}
