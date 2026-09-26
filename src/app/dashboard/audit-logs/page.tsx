import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { AuditLogsClient } from "./audit-logs-client"

export default async function AuditLogsPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ count }], rows] = await Promise.all([
    dbRead.select({ count: sql<number>`count(*)::int` }).from(auditLog),
    dbRead
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
  ])

  return <AuditLogsClient initialData={rows} initialTotal={count} />
}
