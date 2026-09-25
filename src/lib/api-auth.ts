import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { cache } from "react"
import { auth } from "@/lib/auth" // ← was missing
import { db } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"
import { isRoleAllowedIn, parsePortalMode } from "@/lib/portal-mode"

export const requireSession = cache(async () => {
  const hdrs = await headers()
  const session = await auth.api.getSession({ headers: hdrs }) // ← replaces manual token extraction + DB query
  if (!session?.user) return null

  const [row] = await db
    .select({
      userId: profile.userId,
      role: profile.role,
      phone: profile.phone,
      isActive: profile.isActive,
      tableRowsPerPage: profile.tableRowsPerPage,
      warehouseId: profile.warehouseId,
      merchantId: profile.merchantId,
      riderId: profile.riderId,
      createdAt: profile.createdAt,
      name: user.name,
    })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .where(eq(profile.userId, session.user.id))
    .limit(1)

  if (!row) return null

  // Portal-mode gate (ROADMAP 5.4): roles outside this deployment's
  // PORTAL_MODE are treated as unauthenticated (routes surface 401), so a
  // stray session can't call shared APIs. Default `all` keeps behavior
  // unchanged.
  if (!isRoleAllowedIn(row.role, parsePortalMode(process.env.PORTAL_MODE))) {
    return null
  }

  return row
})
