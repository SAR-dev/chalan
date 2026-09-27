import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { siteConfig } from "@/config/site"
import {
  accountStatus,
  issueActivationToken,
  sendActivationEmail,
} from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { profile, profileRoles, user, warehouse } from "@/lib/db/schema"
import { enumValue } from "@/lib/db-helpers"
import { flushEmailOutbox } from "@/lib/email-outbox"
import { logger } from "@/lib/logger"
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
        activatedAt: profile.activatedAt,
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
      .select({ count: sql<number>`count(*)::int` })
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
    status: accountStatus(p),
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
    logger.error("Failed to create user account", { err })
    return badRequest("Failed to create the team member")
  }

  // WAREHOUSE_ADMIN accounts start PENDING: login is rejected until the
  // invitee clicks the emailed activation link and sets their own password
  // (ROADMAP 5.2). The temporary password above seeds the credential.
  const pendingActivation = newRole === "WAREHOUSE_ADMIN"

  // The profile, activation token, warehouse manager link and audit row are one
  // unit (ROADMAP P1.4): a failure deletes the auth user instead of leaving a
  // half-created team member. Better Auth owns its own connection, so the user
  // is created first and cleaned up here if the transaction fails.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(profile).values({
        userId: created.user.id,
        role: newRole,
        phone,
        isActive: !pendingActivation,
        warehouseId:
          newRole === "WAREHOUSE_ADMIN" ? (warehouseId ?? null) : null,
      })

      const token = pendingActivation
        ? await issueActivationToken(created.user.id, tx)
        : null

      if (token) {
        // Enqueued in the same transaction: the invite and its email commit
        // together (ROADMAP P1.5).
        await sendActivationEmail(
          {
            to: email,
            userName: name,
            contextName: siteConfig.name,
            rawToken: token,
          },
          tx,
        )
      }

      // Keep warehouse.managedBy in sync so the assigned warehouse reflects its
      // new manager (and is no longer offered as "unassigned" elsewhere).
      if (newRole === "WAREHOUSE_ADMIN" && warehouseId) {
        await tx
          .update(warehouse)
          .set({ managedBy: created.user.id })
          .where(eq(warehouse.id, warehouseId))
      }

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "TEAM_MEMBER_CREATED",
          entityType: "user",
          entityId: created.user.id,
          description: `Created ${newRole} account for ${created.user.name} (${created.user.email})`,
        },
        tx,
      )

      return token
    })
  } catch (err) {
    await deleteUserQuietly(created.user.id)
    logger.error("Failed to store team member", { err })
    return NextResponse.json(
      { error: "Could not create the team member. Please try again." },
      { status: 500 },
    )
  }

  if (pendingActivation) {
    // Best-effort immediate delivery; the cron retries anything left behind.
    await flushEmailOutbox()
  }

  const [profileRow] = await db
    .select({
      role: profile.role,
      phone: profile.phone,
      isActive: profile.isActive,
      activatedAt: profile.activatedAt,
      warehouseId: profile.warehouseId,
    })
    .from(profile)
    .where(eq(profile.userId, created.user.id))
    .limit(1)

  if (!profileRow) {
    return NextResponse.json(
      { error: "Could not create the team member. Please try again." },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role: profileRow.role,
      phone: profileRow.phone,
      isActive: profileRow.isActive,
      status: accountStatus(profileRow),
      warehouseId: profileRow.warehouseId,
    },
    { status: 201 },
  )
})

/** Best-effort removal of the auth user created for a failed team invite. */
async function deleteUserQuietly(userId: string): Promise<void> {
  try {
    await db.delete(user).where(eq(user.id, userId))
  } catch (err) {
    logger.error("Orphan user cleanup failed", { err })
  }
}
