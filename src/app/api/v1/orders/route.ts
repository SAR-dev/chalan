import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm"
import { NextResponse } from "next/server"
import { createOrderForMerchant } from "@/features/orders/create-order"
import { authenticateApiKey, hasApiKeyScope } from "@/lib/api-keys"
import { forbidden } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import {
  deliveryCity as deliveryCityTable,
  merchant,
  order,
  orderStatuses,
  pickupLocation,
  warehouse,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import {
  paginateResponse,
  parseDateRange,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimit } from "@/lib/rate-limit"
import { orderCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Programmatic orders (R2) — authenticated by API key, not by session.
 *
 * `Authorization: Bearer chl_live_…` replaces the session cookie. A key is
 * scoped to exactly one merchant, so the merchant is never read from the body
 * — a v1 caller cannot point a request at another merchant's data, even by
 * accident.
 *
 * `recipientMail` is accepted here (and stored on the order) because the docs
 * page and the webhook payload both promise it; the field is nullable so older
 * orders and portal-created ones without it keep working.
 */

function unauthorizedV1(): NextResponse {
  return NextResponse.json(
    { error: "Provide a valid API key as Authorization: Bearer <key>" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="api"' } },
  )
}

export const GET = withErrorHandler(async (req: Request) => {
  const key = await authenticateApiKey(req)
  if (!key) return unauthorizedV1()
  if (!hasApiKeyScope(key, "orders:read"))
    return forbidden("This key cannot read orders")

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "no-ip"
  const limited = await rateLimit(`v1-orders-read:${key.keyId}:${ip}`, 60, 60)
  if (limited) return limited

  let where = eq(order.merchantId, key.merchantId)

  const search = new URL(req.url).searchParams.get("q")?.trim()
  if (search) {
    const likeQ = `%${search}%`
    const searchClause = or(
      ilike(order.id, likeQ),
      ilike(order.recipientName, likeQ),
      ilike(order.recipientPhone, likeQ),
    )
    where = and(where, searchClause) as typeof where
  }

  const statuses = parseStatusFilter(req, orderStatuses)
  if (statuses.length > 0) {
    const statusClause = inArray(
      order.status,
      enumValues<(typeof orderStatuses)[number]>(statuses),
    )
    where = and(where, statusClause) as typeof where
  }

  const dateRange = parseDateRange(req)
  if (dateRange) {
    const dateClause = and(
      gte(order.createdAt, dateRange.from.toISOString()),
      lte(order.createdAt, dateRange.to.toISOString()),
    )
    where = and(where, dateClause) as typeof where
  }

  const { limit, offset } = parsePagination(req, { defaultLimit: 20 })

  const countQuery = dbRead
    .select({ count: sql<number>`count(*)::int` })
    .from(order)
    .where(where)

  let dbQuery = dbRead
    .select({
      ...ORDER_CORE_COLUMNS,
      merchantNote: order.merchantNote,
      merchantPhone: merchant.phone,
      pickupLocationMapLink: pickupLocation.mapLink,
      expectedDeliveryAt: order.expectedDeliveryAt,
      recipientMail: order.recipientMail,
    })
    .from(order)
    .leftJoin(merchant, eq(order.merchantId, merchant.id))
    .leftJoin(pickupLocation, eq(order.pickupLocationId, pickupLocation.id))
    .leftJoin(deliveryCityTable, eq(order.deliveryCityId, deliveryCityTable.id))
    .$dynamic()
    .where(where)

  const sortColumnMap = {
    createdAt: order.createdAt,
    order: order.id,
    status: order.status,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    dbQuery =
      sort.direction === "asc"
        ? dbQuery.orderBy(asc(sort.column))
        : dbQuery.orderBy(desc(sort.column))
  } else {
    dbQuery = dbQuery.orderBy(desc(order.createdAt), desc(order.id))
  }

  if (limit !== undefined) dbQuery = dbQuery.limit(limit)
  if (offset !== undefined) dbQuery = dbQuery.offset(offset)

  const [[{ count }], rows] = await Promise.all([countQuery, dbQuery])
  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

export const POST = withErrorHandler(async (req: Request) => {
  const key = await authenticateApiKey(req)
  if (!key) return unauthorizedV1()
  if (!hasApiKeyScope(key, "orders:write"))
    return forbidden("This key cannot create orders")

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "no-ip"
  const limited = await rateLimit(`v1-orders-write:${key.keyId}:${ip}`, 30, 60)
  if (limited) return limited

  const parsed = await parseBody(req, orderCreateSchema)
  if (parsed.error) return parsed.error

  const idempotencyKey =
    req.headers.get("idempotency-key")?.trim() ||
    req.headers.get("Idempotency-Key")?.trim() ||
    null

  const created = await createOrderForMerchant(
    key.merchantId,
    parsed.data,
    { name: `api-key:${key.keyId}` },
    idempotencyKey,
  )

  if (created.ok) return NextResponse.json(created.order, { status: 201 })
  if (created.response) return created.response
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Duplicate request" }, { status: 409 })
  }
  const [existing] = await db
    .select()
    .from(order)
    .where(
      and(
        eq(order.merchantId, key.merchantId),
        eq(order.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)
  if (existing) return NextResponse.json(existing)
  return NextResponse.json({ error: "Duplicate request" }, { status: 409 })
})
