import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { SupportPageClient } from "@/features/support/components/support-page-client"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { supportTicket } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"

export default async function SupportPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], rows] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(supportTicket),
    dbRead
      .select()
      .from(supportTicket)
      .orderBy(desc(supportTicket.createdAt))
      .limit(limit),
  ])

  return <SupportPageClient isAdmin initialData={rows} initialTotal={total} />
}
