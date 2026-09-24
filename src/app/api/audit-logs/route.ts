import { asc, desc, ilike, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (
req: Request
) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json(paginateResponse([], 0), { status: 200 })
  }

  const { limit, offset } = parsePagination(req)
  const search = new URL(req.url).searchParams.get("q")?.trim()
  const where = search
    ? (() => {
        const likeQ = `%${search}%`
        return or(
          ilike(auditLog.actorName, likeQ),
          ilike(auditLog.action, likeQ),
          ilike(auditLog.entityType, likeQ),
          ilike(auditLog.description, likeQ),
        )
      })()
    : undefined

  let q = db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: auditLog.actorName,
      actorRole: auditLog.actorRole,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      description: auditLog.description,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    createdAt: auditLog.createdAt,
    actor: auditLog.actorName,
    actorRole: auditLog.actorRole,
    action: auditLog.action,
    entity: auditLog.entityType,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    q = q.orderBy(desc(auditLog.createdAt))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(auditLog).where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

