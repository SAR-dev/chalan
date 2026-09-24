import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { profile, profileRoles, user, warehouse } from "@/lib/db/schema"
import { enumValue } from "@/lib/db-helpers"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import type { TeamMember } from "@/lib/types"
import { parseBody, teamCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  // Only the Super Admin manages the Admin / Warehouse Admin roster.
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json(paginateResponse([], 0), { status: 200 })
  }

  const { limit, offset } = parsePagination(req)
  let where = inArray(profile.role, ["SUPER_ADMIN", "WAREHOUSE_ADMIN"])
  const search = new URL(req.url).searchParams.get("q")?.trim()
  if (search) {
    const likeQ = `%${search}%`
    where = and(
      where,
      or(
        ilike(user.name, likeQ),
        ilike(user.email, likeQ),
        ilike(profile.phone, likeQ),
      ),
    )!
  }

  const roleParam = new URL(req.url).searchParams.get("role")?.trim()
  const role = enumValue(roleParam, profileRoles)
  if (role) {
    where = and(where, eq(profile.role, role))!
  }

  let q = dbRead
    .select({
      profile: {
        role: profile.role,
        phone: profile.phone,
        isActive: profile.isActive,
        warehouseId: profile.warehouseId,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
    .from(profile)
    .innerJoin(user, eq(profile.userId, user.id))
    .where(where)
    .$dynamic()

  const sortColumnMap = {
    name: user.name,
    contact: user.email,
    status: profile.isActive,
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

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    dbRead
      .select({ count: sql<number>`count(*)` })
      .from(profile)
      .innerJoin(user, eq(profile.userId, user.id))
      .where(where),
    q,
  ])

  const team: TeamMember[] = rows.map(({ profile: p, user: u }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: p.role,
    phone: p.phone,
    isActive: p.isActive,
    warehouseId: p.warehouseId,
  }))

  return NextResponse.json(paginateResponse(team, count, limit, offset))
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const parsed = await parseBody(req, teamCreateSchema)
  if (parsed.error) return parsed.error
  const {
    name,
    email,
    phone,
    role: newRole,
    warehouseId,
    password,
  } = parsed.data

  // Use the admin plugin (no headers passed) so the caller's own session
  // cookie is untouched. createUser throws on failure.
  let created
  try {
    created = await auth.api.createUser({
      // The app's real role lives in the `profile` table; Better Auth's admin
      // plugin only types `role` as "user" | "admin", so cast to satisfy it.
      body: { name, email, password, role: newRole as "user" },
    })
  } catch (err) {
    console.error("[team] Failed to create user account:", err)
    return badRequest("Failed to create the team member")
  }

  await db.insert(profile).values({
    userId: created.user.id,
    role: newRole,
    phone,
    isActive: true,
    warehouseId: newRole === "WAREHOUSE_ADMIN" ? (warehouseId ?? null) : null,
  })

  // Keep warehouse.managedBy in sync so the assigned warehouse reflects its
  // new manager (and is no longer offered as "unassigned" elsewhere).
  if (newRole === "WAREHOUSE_ADMIN" && warehouseId) {
    await db
      .update(warehouse)
      .set({ managedBy: created.user.id })
      .where(eq(warehouse.id, warehouseId))
  }

  const [profileRow] = await db
    .select({
      role: profile.role,
      phone: profile.phone,
      isActive: profile.isActive,
      warehouseId: profile.warehouseId,
    })
    .from(profile)
    .where(eq(profile.userId, created.user.id))
    .limit(1)

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "TEAM_MEMBER_CREATED",
    entityType: "user",
    entityId: created.user.id,
    description: `Created ${newRole} account for ${created.user.name} (${created.user.email})`,
  })

  return NextResponse.json(
    {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role: profileRow.role,
      phone: profileRow.phone,
      isActive: profileRow.isActive,
      warehouseId: profileRow.warehouseId,
    },
    { status: 201 },
  )
})
