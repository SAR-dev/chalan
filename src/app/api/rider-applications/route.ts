import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { enumValues } from "@/lib/db-helpers"
import { profile, rider, riderStatuses, warehouse } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort, parseStatusFilter } from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, riderApplySchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// ---------------------------------------------------------------------------
// POST — public rider application (no auth required)
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (
req: Request
) => {
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

  // Check for duplicate email among existing riders.
  const [existing] = await db
    .select({ id: rider.id })
    .from(rider)
    .where(ilike(rider.email, email))
    .limit(1)
  if (existing) {
    return badRequest("An application with this email already exists.")
  }

  // Create the auth user account with the provided password.
  const { auth } = await import("@/lib/auth")
  let createdUser
  try {
    createdUser = await auth.api.createUser({
      body: { name, email, password, role: "RIDER" as "user" },
    })
  } catch (err) {
    console.error("[rider-applications] Failed to create user account:", err)
    return badRequest("Could not create the rider account")
  }

  // Insert the rider row.
  const hasNidImages = Boolean(nidFrontImage || nidBackImage || nidSelfieImage)
  const [newRider] = await db
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

  // Create a profile linking the auth user → rider row.
  await db.insert(profile).values({
    userId: createdUser.user.id,
    role: "RIDER",
    phone,
    isActive: false,
    riderId: newRider.id,
  })

  await logAudit({
    actor: { userId: "public", name, role: "RIDER" },
    action: "RIDER_APPLICATION_SUBMITTED",
    entityType: "rider",
    entityId: newRider.id,
    description: `Rider application submitted by ${name} (${zone})`,
  })

  return NextResponse.json(
    { message: "Application submitted successfully" },
    { status: 201 },
  )
})


// ---------------------------------------------------------------------------
// GET — list rider applications (admin only)
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (
req: Request
) => {
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
    const statusClause = inArray(rider.status, enumValues<(typeof riderStatuses)[number]>(statuses))
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
    .select({ count: sql<number>`count(*)` })
    .from(rider)
    .where(where)

  const [[{ count }], rows] = await Promise.all([countQuery, q])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

