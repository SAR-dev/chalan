import { and, asc, desc, eq, ilike, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { announcementCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  // The management list (incl. drafts) is super-admin only — the public inbox
  // reads /api/announcements/active instead.
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { limit, offset } = parsePagination(req)
  const url = new URL(req.url)
  const search = url.searchParams.get("q")?.trim()
  const activeParam = url.searchParams.get("active")
  const conditions = []
  if (search) conditions.push(ilike(announcement.title, `%${search}%`))
  if (activeParam === "true") conditions.push(eq(announcement.isActive, true))
  if (activeParam === "false") conditions.push(eq(announcement.isActive, false))
  const where = conditions.length ? and(...conditions) : undefined

  let q = dbRead
    .select({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      isActive: announcement.isActive,
      targetRoles: announcement.targetRoles,
      createdBy: announcement.createdBy,
      createdAt: announcement.createdAt,
    })
    .from(announcement)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    title: announcement.title,
    publishedAt: announcement.publishedAt,
    expiresAt: announcement.expiresAt,
    isActive: announcement.isActive,
    createdAt: announcement.createdAt,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    q = q.orderBy(desc(announcement.createdAt))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([
    dbRead
      .select({ count: sql<number>`count(*)` })
      .from(announcement)
      .where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, announcementCreateSchema)
  if (parsed.error) return parsed.error

  const { title, content, publishedAt, expiresAt, isActive, targetRoles } =
    parsed.data

  const [created] = await db
    .insert(announcement)
    .values({
      title,
      content,
      publishedAt: publishedAt ?? null,
      expiresAt: expiresAt ?? null,
      isActive: isActive ?? true,
      targetRoles,
      createdBy: me.name,
    })
    .returning()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "ANNOUNCEMENT_CREATED",
    entityType: "announcement",
    entityId: created.id,
    description: `Created announcement "${created.title}"`,
  })

  return NextResponse.json(created, { status: 201 })
})
