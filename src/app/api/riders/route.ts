import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req)
  const search = new URL(req.url).searchParams.get("q")?.trim()
  const warehouseIdParam = new URL(req.url).searchParams
    .get("warehouseId")
    ?.trim()
  const isActiveParam = new URL(req.url).searchParams.get("isActive")
  const taskTypeParam = new URL(req.url).searchParams.get("taskType")?.trim()
  let searchClause: ReturnType<typeof ilike> | undefined
  if (search) {
    const likeQ = `%${search}%`
    searchClause = or(ilike(rider.name, likeQ), ilike(rider.zone, likeQ))
  }

  let warehouseFilter: ReturnType<typeof eq> | undefined
  if (warehouseIdParam) {
    warehouseFilter = eq(rider.warehouseId, warehouseIdParam)
  }

  let isActiveFilter: ReturnType<typeof eq> | undefined
  if (isActiveParam === "true") {
    isActiveFilter = eq(rider.isActive, true)
  } else if (isActiveParam === "false") {
    isActiveFilter = eq(rider.isActive, false)
  }

  let taskTypeFilter: ReturnType<typeof eq> | undefined
  if (taskTypeParam) {
    taskTypeFilter = eq(rider.taskType, taskTypeParam as any)
  }

  const combine = (...clauses: (typeof searchClause | undefined)[]) =>
    clauses.filter(Boolean).length > 1
      ? and(...clauses.filter(Boolean)!)
      : clauses.filter(Boolean)[0]

  // Warehouse Admins only manage the riders based at their own hub. Admins and
  // Super Admins see the full roster.
  if (me.role === "WAREHOUSE_ADMIN") {
    if (!me.warehouseId) return NextResponse.json(paginateResponse([], 0))
    const scopedWhere = combine(
      eq(rider.warehouseId, me.warehouseId),
      searchClause,
      isActiveFilter,
      taskTypeFilter,
    )

    let scopedQuery = dbRead
      .select({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        zone: rider.zone,
        taskType: rider.taskType,
        warehouseId: rider.warehouseId,
        isActive: rider.isActive,
      })
      .from(rider)
      .where(scopedWhere)
      .$dynamic()

    const sortColumnMap = {
      name: rider.name,
      phone: rider.phone,
      zone: rider.zone,
      taskType: rider.taskType,
      isActive: rider.isActive,
    }
    const sort = parseSort(req, sortColumnMap)
    if (sort) {
      scopedQuery =
        sort.direction === "asc"
          ? scopedQuery.orderBy(asc(sort.column))
          : scopedQuery.orderBy(desc(sort.column))
    }

    if (limit !== undefined) scopedQuery = scopedQuery.limit(limit)
    if (offset !== undefined) scopedQuery = scopedQuery.offset(offset)

    // COUNT and data fetch are independent — run them in parallel.
    const [[{ count }], scoped] = await Promise.all([
      dbRead
        .select({ count: sql<number>`count(*)` })
        .from(rider)
        .where(scopedWhere),
      scopedQuery,
    ])

    return NextResponse.json(paginateResponse(scoped, count, limit, offset))
  }

  const where = combine(
    warehouseFilter,
    searchClause,
    isActiveFilter,
    taskTypeFilter,
  )

  let q = dbRead
    .select({
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      zone: rider.zone,
      taskType: rider.taskType,
      warehouseId: rider.warehouseId,
      isActive: rider.isActive,
    })
    .from(rider)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    name: rider.name,
    phone: rider.phone,
    zone: rider.zone,
    taskType: rider.taskType,
    isActive: rider.isActive,
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
    dbRead.select({ count: sql<number>`count(*)` }).from(rider).where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
}
