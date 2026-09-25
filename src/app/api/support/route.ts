import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { supportStatuses, supportTicket } from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import {
  paginateResponse,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, supportCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req)
  const url = new URL(req.url)
  const search = url.searchParams.get("q")?.trim()
  const statuses = parseStatusFilter(req, supportStatuses)

  // Scoping: SUPER_ADMIN sees every ticket; every other role only sees the
  // tickets it created (actorName/actorRole are denormalized on the row).
  const conditions: SQL[] = []
  if (me.role !== "SUPER_ADMIN") {
    conditions.push(eq(supportTicket.userId, me.userId))
  }
  if (search) {
    const likeQ = `%${search}%`
    const searchClause = or(
      ilike(supportTicket.subject, likeQ),
      ilike(supportTicket.message, likeQ),
      ilike(supportTicket.actorName, likeQ),
    )
    if (searchClause) conditions.push(searchClause)
  }
  if (statuses.length > 0) {
    conditions.push(
      inArray(
        supportTicket.status,
        enumValues<(typeof supportStatuses)[number]>(statuses),
      ),
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  let q = dbRead
    .select({
      id: supportTicket.id,
      userId: supportTicket.userId,
      actorName: supportTicket.actorName,
      actorRole: supportTicket.actorRole,
      subject: supportTicket.subject,
      message: supportTicket.message,
      status: supportTicket.status,
      adminReply: supportTicket.adminReply,
      repliedAt: supportTicket.repliedAt,
      repliedBy: supportTicket.repliedBy,
      createdAt: supportTicket.createdAt,
      updatedAt: supportTicket.updatedAt,
    })
    .from(supportTicket)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    subject: supportTicket.subject,
    status: supportTicket.status,
    createdAt: supportTicket.createdAt,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    q = q.orderBy(desc(supportTicket.createdAt))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    dbRead
      .select({ count: sql<number>`count(*)` })
      .from(supportTicket)
      .where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

// Any authenticated role can open a ticket. actorName/actorRole are copied
// from the session so the admin list never needs a join to render the
// requester.
export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const limited = await rateLimitByIp(req, "support", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, supportCreateSchema)
  if (parsed.error) return parsed.error
  const { subject, message } = parsed.data

  const [created] = await db
    .insert(supportTicket)
    .values({
      userId: me.userId,
      actorName: me.name,
      actorRole: me.role,
      subject: subject.trim(),
      message: message.trim(),
      status: "OPEN",
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
})
