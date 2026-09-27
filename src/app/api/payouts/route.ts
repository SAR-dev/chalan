import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import {
  merchant,
  order,
  payoutRequest,
  payoutRequestStatuses,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import { hasNavPermission } from "@/lib/nav-config"
import {
  paginateResponse,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, payoutCreateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req)
  const search = new URL(req.url).searchParams.get("q")?.trim()
  let searchClause
  if (search) {
    const likeQ = `%${search}%`
    const conditions = [ilike(payoutRequest.id, likeQ)]
    // Also search by merchant business name.
    const merchantIds = dbRead
      .select({ id: merchant.id })
      .from(merchant)
      .where(ilike(merchant.businessName, likeQ))
    conditions.push(inArray(payoutRequest.merchantId, merchantIds))
    searchClause = or(...conditions)
  }

  const statuses = parseStatusFilter(req, payoutRequestStatuses)

  if (me.role === "MERCHANT" && me.merchantId) {
    let where = eq(payoutRequest.merchantId, me.merchantId)
    if (searchClause) where = and(where, searchClause)!
    if (statuses.length > 0)
      where = and(
        where,
        inArray(
          payoutRequest.status,
          enumValues<(typeof payoutRequestStatuses)[number]>(statuses),
        ),
      )!

    let q = dbRead
      .select({
        id: payoutRequest.id,
        merchantId: payoutRequest.merchantId,
        orderIds: payoutRequest.orderIds,
        amount: payoutRequest.amount,
        status: payoutRequest.status,
        payoutMethod: payoutRequest.payoutMethod,
        payoutDetails: payoutRequest.payoutDetails,
        requestedAt: payoutRequest.requestedAt,
        rejectReason: payoutRequest.rejectReason,
        paidAt: payoutRequest.paidAt,
      })
      .from(payoutRequest)
      .where(where)
      .$dynamic()

    const sortColumnMap = {
      request: payoutRequest.id,
      method: payoutRequest.payoutMethod,
      requested: payoutRequest.requestedAt,
      amount: payoutRequest.amount,
      status: payoutRequest.status,
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
        .from(payoutRequest)
        .where(where),
      q,
    ])

    return NextResponse.json(paginateResponse(rows, count, limit, offset))
  }

  if (me.role !== "SUPER_ADMIN")
    return NextResponse.json(paginateResponse([], 0))

  const merchantIdParam = new URL(req.url).searchParams
    .get("merchantId")
    ?.trim()
  let where = merchantIdParam
    ? eq(payoutRequest.merchantId, merchantIdParam)
    : undefined

  if (searchClause) {
    where = where ? and(where, searchClause) : searchClause
  }
  if (statuses.length > 0) {
    const statusClause = inArray(
      payoutRequest.status,
      enumValues<(typeof payoutRequestStatuses)[number]>(statuses),
    )
    where = where ? and(where, statusClause) : statusClause
  }

  let q = dbRead
    .select({
      id: payoutRequest.id,
      merchantId: payoutRequest.merchantId,
      orderIds: payoutRequest.orderIds,
      amount: payoutRequest.amount,
      status: payoutRequest.status,
      payoutMethod: payoutRequest.payoutMethod,
      payoutDetails: payoutRequest.payoutDetails,
      requestedAt: payoutRequest.requestedAt,
      rejectReason: payoutRequest.rejectReason,
      paidAt: payoutRequest.paidAt,
    })
    .from(payoutRequest)
    .$dynamic()
  if (where) q = q.where(where)

  const sortColumnMap = {
    request: payoutRequest.id,
    method: payoutRequest.payoutMethod,
    requested: payoutRequest.requestedAt,
    amount: payoutRequest.amount,
    status: payoutRequest.status,
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
      .from(payoutRequest)
      .where(where),
    q,
  ])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) {
    return forbidden("Only merchants can request payouts")
  }
  // Payout requests are the Finance surface — moderators need the grant
  // (ROADMAP 5.2 hard server checks).
  if (!hasNavPermission(me, "/merchant/finance")) {
    return forbidden("You don't have access to Finance.")
  }

  const limited = await rateLimitByIp(req, "payouts", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, payoutCreateSchema)
  if (parsed.error) return parsed.error
  const { payoutMethod, payoutDetails } = parsed.data

  // Read + lock the eligible orders INSIDE the transaction and link exactly
  // those rows (ROADMAP P0.3). Two concurrent requests now serialize on the
  // row locks: the second sees `payoutRequestId` already set and finds no
  // eligible orders, so no orphan request carrying an amount but no orders can
  // be created.
  const newRequest = await db.transaction(async (tx) => {
    const payableOrders = await tx
      .select({ id: order.id, merchantEarnings: order.merchantEarnings })
      .from(order)
      .where(
        and(
          eq(order.merchantId, me.merchantId!),
          eq(order.status, "DELIVERED"),
          sql`${order.codSettledAt} is not null`,
          isNull(order.payoutRequestId),
        ),
      )
      .for("update")

    if (payableOrders.length === 0) return null

    const orderIds = payableOrders.map((o: { id: string }) => o.id)
    const amount = payableOrders.reduce(
      (sum: number, o: { merchantEarnings: number }) =>
        sum + o.merchantEarnings,
      0,
    )

    const [inserted] = await tx
      .insert(payoutRequest)
      .values({
        merchantId: me.merchantId!,
        orderIds,
        amount,
        status: "PENDING",
        payoutMethod: payoutMethod.trim(),
        payoutDetails: payoutDetails.trim(),
      })
      .returning()

    await tx
      .update(order)
      .set({ payoutRequestId: inserted.id })
      .where(and(inArray(order.id, orderIds), isNull(order.payoutRequestId)))

    return inserted
  })

  if (!newRequest) {
    return badRequest("No settled funds available to request.")
  }

  return NextResponse.json(newRequest, { status: 201 })
})
