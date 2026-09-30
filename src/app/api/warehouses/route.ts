import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { db, dbRead } from "@/lib/db"
import { warehouse } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { parseBody, warehouseCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })
  const search = new URL(req.url).searchParams.get("q")?.trim()
  let where
  if (search) {
    const likeQ = `%${search}%`
    where = or(
      ilike(warehouse.name, likeQ),
      ilike(warehouse.address, likeQ),
      ilike(warehouse.city, likeQ),
    )
  }

  let q = dbRead
    .select({
      id: warehouse.id,
      name: warehouse.name,
      address: warehouse.address,
      city: warehouse.city,
      isActive: warehouse.isActive,
      managedBy: warehouse.managedBy,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    })
    .from(warehouse)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    name: warehouse.name,
    city: warehouse.city,
    isActive: warehouse.isActive,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    // Stable default so OFFSET paging cannot repeat or skip rows.
    q = q.orderBy(desc(warehouse.createdAt), desc(warehouse.id))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    dbRead
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouse)
      .where(where),
    q,
  ])

  // Warehouses change rarely — allow short-lived browser caching to avoid a
  // round-trip on repeat navigation.
  return NextResponse.json(paginateResponse(rows, count, limit, offset), {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  })
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const parsed = await parseBody(req, warehouseCreateSchema)
  if (parsed.error) return parsed.error
  const { name, address, city } = parsed.data

  const [existing] = await db
    .select({ id: warehouse.id })
    .from(warehouse)
    .where(
      and(eq(warehouse.name, name.trim()), eq(warehouse.city, city.trim())),
    )
    .limit(1)
  if (existing) {
    return conflict("A warehouse with that name already exists in this city.")
  }

  const [created] = await db
    .insert(warehouse)
    .values({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      isActive: true,
    })
    .returning()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "WAREHOUSE_CREATED",
    entityType: "warehouse",
    entityId: created.id,
    description: `Created warehouse ${created.name} (${created.city})`,
  })

  return NextResponse.json(created, { status: 201 })
})
