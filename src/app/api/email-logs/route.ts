import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { dbRead as db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json(paginateResponse([], 0), { status: 200 })
  }

  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })
  const url = new URL(req.url)
  const search = url.searchParams.get("q")?.trim()
  const statusParam = url.searchParams.get("status")
  const conditions = []
  if (search) {
    const likeQ = `%${search}%`
    conditions.push(
      or(ilike(emailLog.to, likeQ), ilike(emailLog.subject, likeQ)),
    )
  }
  if (statusParam === "SENT" || statusParam === "FAILED") {
    conditions.push(eq(emailLog.status, statusParam))
  }
  const where = conditions.length ? and(...conditions) : undefined

  // `body` / `textBody` are deliberately NOT selected here (ROADMAP P3): they
  // are the bulk of the row payload and only the detail view needs them, so
  // every page of the list used to ship a full email preview per row. They are
  // fetched on demand from `GET /api/email-logs/[id]`.
  let q = db
    .select({
      id: emailLog.id,
      to: emailLog.to,
      subject: emailLog.subject,
      status: emailLog.status,
      attempts: emailLog.attempts,
      error: emailLog.error,
      createdAt: emailLog.createdAt,
      updatedAt: emailLog.updatedAt,
      markedSentBy: emailLog.markedSentBy,
      markedSentAt: emailLog.markedSentAt,
    })
    .from(emailLog)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    createdAt: emailLog.createdAt,
    to: emailLog.to,
    subject: emailLog.subject,
    status: emailLog.status,
    attempts: emailLog.attempts,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    q = q.orderBy(desc(emailLog.createdAt))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})
