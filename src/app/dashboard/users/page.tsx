import { desc, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"
import { UsersPageClient } from "./users-client"

export default async function UsersPage() {
  const me = await requireSession()
  if (!me) redirect("/login")
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], rows] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id)),
    dbRead
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: profile.role,
        isActive: profile.isActive,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .orderBy(desc(user.createdAt))
      .limit(limit),
  ])

  return <UsersPageClient initialData={rows} initialTotal={total} />
}
