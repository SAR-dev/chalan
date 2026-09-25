import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { profile, profileRoles, user } from "@/lib/db/schema"
import { enumValue } from "@/lib/db-helpers"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { limit, offset } = parsePagination(req)
  const url = new URL(req.url)
  const search = url.searchParams.get("q")?.trim()
  const roleFilter = enumValue(
    url.searchParams.get("role")?.trim() ?? null,
    profileRoles,
  )

  let where = search
    ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
    : undefined
  if (roleFilter) {
    const roleClause = eq(profile.role, roleFilter)
    where = where ? and(where, roleClause) : roleClause
  }

  let q = dbRead
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
    .$dynamic()
  if (where) q = q.where(where)

  const countQuery = dbRead
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(where)

  const sortColumnMap = {
    name: user.name,
    email: user.email,
    role: profile.role,
    createdAt: user.createdAt,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  const [[{ count }], rows] = await Promise.all([countQuery, q])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})
