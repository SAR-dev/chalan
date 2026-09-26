import { eq, inArray, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { accountStatus } from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { profile, user, warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { TeamPageClient } from "./team-client"

export default async function TeamPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], teamRows, warehouseRows] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(profile)
      .innerJoin(user, eq(profile.userId, user.id))
      .where(inArray(profile.role, ["SUPER_ADMIN", "WAREHOUSE_ADMIN"])),
    dbRead
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: profile.role,
        phone: profile.phone,
        isActive: profile.isActive,
        activatedAt: profile.activatedAt,
        warehouseId: profile.warehouseId,
      })
      .from(profile)
      .innerJoin(user, eq(profile.userId, user.id))
      .where(inArray(profile.role, ["SUPER_ADMIN", "WAREHOUSE_ADMIN"]))
      .orderBy(user.name)
      .limit(limit),
    dbRead
      .select({
        id: warehouse.id,
        name: warehouse.name,
        city: warehouse.city,
      })
      .from(warehouse)
      .orderBy(warehouse.name),
  ])

  // TeamMember.status is derived (never stored) — same rule as the API.
  const initialData = teamRows.map((row) => ({
    ...row,
    status: accountStatus(row),
  }))

  return (
    <TeamPageClient
      initialData={initialData}
      initialTotal={total}
      initialWarehouses={warehouseRows}
    />
  )
}
