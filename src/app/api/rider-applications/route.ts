import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { profile, rider, riderStatuses, user, warehouse } from "@/lib/db/schema"
import { isUniqueViolation } from "@/lib/db-errors"
import { enumValues } from "@/lib/db-helpers"
import { logger } from "@/lib/logger"
import {
  paginateResponse,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, riderApplySchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// ---------------------------------------------------------------------------
// POST — public rider application (no auth required)
// ---------------------------------------------------------------------------

/** Best-effort removal of the auth user created for a failed application. */
async function deleteUserQuietly(userId: string): Promise<void> {
  try {
    await db.delete(user).where(eq(user.id, userId))
  } catch (err) {
    logger.error("Orphan user cleanup failed", { err })
  }
}

export const POST = withErrorHandler(async (req: Request) => {
  const limited = await rateLimitByIp(req, "rider-apply", 3, 60)
  if (limited) return limited

  const parsed = await parseBody(req, riderApplySchema)
  if (parsed.error) return parsed.error
  const {
    name,
    email,
    phone,
    zone,
    address,
    nidNumber,
    nidFrontImage,
    nidBackImage,
    nidSelfieImage,
    warehouseId,
    password,
  } = parsed.data

  // The selected warehouse must exist and be active.
  const [wh] = await db
    .select({ id: warehouse.id })
    .from(warehouse)
    .where(and(eq(warehouse.id, warehouseId), eq(warehouse.isActive, true)))
    .limit(1)
  if (!wh) {
    return badRequest("Select a valid warehouse.")
  }

  // Friendly pre-check; `rider_email_uniq` is the guarantee (P1.1).
  const [existing] = await dbRead
    .select({ id: rider.id })
    .from(rider)
    .where(ilike(rider.email, email))
    .limit(1)
  if (existing) {
    return badRequest("An application with this email already exists.")
  }

  // Create the auth user account with the provided password. Better Auth owns
  // its own connection, so it cannot join our transaction — it is created first
  // and deleted again if the rider/profile write fails.
  const { auth } = await import("@/lib/auth")
  let createdUser
  try {
    createdUser = await auth.api.createUser({
      body: { name, email, password, role: "RIDER" as "user" },
    })
  } catch (err) {
    logger.error("Failed to create user account", { err })
    return badRequest("Could not create the rider account")
  }

  const hasNidImages = Boolean(nidFrontImage || nidBackImage || nidSelfieImage)
  try {
    // Rider + profile + audit are one unit: a failure can no longer leave a
    // rider row without its profile (or an audit-less application).
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(rider)
        .values({
          name,
          email,
          phone,
          zone,
          address,
          nidNumber: nidNumber ?? "",
          nidFrontImage: nidFrontImage ?? null,
          nidBackImage: nidBackImage ?? null,
          nidSelfieImage: nidSelfieImage ?? null,
          nidSubmittedAt: hasNidImages ? new Date().toISOString() : null,
          warehouseId,
          status: "PENDING",
          isActive: false,
        })
        .returning()

      await tx.insert(profile).values({
        userId: createdUser.user.id,
        role: "RIDER",
        phone,
        isActive: false,
        riderId: row.id,
      })

      await logAudit(
        {
          actor: { userId: "public", name, role: "RIDER" },
          action: "RIDER_APPLICATION_SUBMITTED",
          entityType: "rider",
          entityId: row.id,
          description: `Rider application submitted by ${name} (${zone})`,
        },
        tx,
      )

      return row
    })
  } catch (err) {
    // Another application for the same email won the race.
    if (isUniqueViolation(err)) {
      await deleteUserQuietly(createdUser.user.id)
      return badRequest("An application with this email already exists.")
    }
    logger.error("Failed to store application", { err })
    await deleteUserQuietly(createdUser.user.id)
    return NextResponse.json(
      { error: "Could not store the application. Please try again." },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { message: "Application submitted successfully" },
    { status: 201 },
  )
})

// ---------------------------------------------------------------------------
// GET — list rider applications (admin only)
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { limit, offset } = parsePagination(req)
  const search = new URL(req.url).searchParams.get("q")?.trim()
  let where = search
    ? or(
        ilike(rider.name, `%${search}%`),
        ilike(rider.phone, `%${search}%`),
        ilike(rider.email, `%${search}%`),
        ilike(rider.zone, `%${search}%`),
      )
    : undefined

  const statuses = parseStatusFilter(req, riderStatuses)
  if (statuses.length > 0) {
    const statusClause = inArray(
      rider.status,
      enumValues<(typeof riderStatuses)[number]>(statuses),
    )
    where = where ? and(where, statusClause) : statusClause
  }

  let q = dbRead
    .select({
      id: rider.id,
      name: rider.name,
      email: rider.email,
      phone: rider.phone,
      zone: rider.zone,
      address: rider.address,
      nidNumber: rider.nidNumber,
      nidFrontImage: rider.nidFrontImage,
      nidBackImage: rider.nidBackImage,
      nidSelfieImage: rider.nidSelfieImage,
      nidSubmittedAt: rider.nidSubmittedAt,
      status: rider.status,
      taskType: rider.taskType,
      warehouseId: rider.warehouseId,
      approvedBy: rider.approvedBy,
      approvedAt: rider.approvedAt,
      rejectionReason: rider.rejectionReason,
      createdAt: rider.createdAt,
      warehouseName: warehouse.name,
    })
    .from(rider)
    .leftJoin(warehouse, eq(rider.warehouseId, warehouse.id))
    .$dynamic()

  if (where) q = q.where(where)

  const sortColumnMap = {
    name: rider.name,
    status: rider.status,
    createdAt: rider.createdAt,
    zone: rider.zone,
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

  const countQuery = dbRead
    .select({ count: sql<number>`count(*)::int` })
    .from(rider)
    .where(where)

  const [[{ count }], rows] = await Promise.all([countQuery, q])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})
