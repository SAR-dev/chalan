import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, unauthorized } from "@/lib/api-response"
import { auth } from "@/lib/auth"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { db, dbRead } from "@/lib/db"
import {
  merchant,
  merchantBalance,
  merchantStatuses,
  profile,
  user,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { logger } from "@/lib/logger"
import { merchantRegisteredTemplate } from "@/lib/mail-templates"
import {
  paginateResponse,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { merchantRegisterSchema, parseBody } from "@/lib/validation"
import { issueVerifyToken, verifyTokenUrl } from "@/lib/verify-token"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  // A merchant only ever sees their own business row — no pagination needed.
  if (me.role === "MERCHANT" && me.merchantId) {
    const rows = await dbRead
      .select({
        id: merchant.id,
        businessName: merchant.businessName,
        ownerName: merchant.ownerName,
        email: merchant.email,
        phone: merchant.phone,
        address: merchant.address,
        status: merchant.status,
        businessType: merchant.businessType,
        emailVerifiedAt: merchant.emailVerifiedAt,
        phoneVerifiedAt: merchant.phoneVerifiedAt,
        nidSubmittedAt: merchant.nidSubmittedAt,
        nidVerifiedAt: merchant.nidVerifiedAt,
        nidRejectedAt: merchant.nidRejectedAt,
        brandColor: merchant.brandColor,
        hidePlatformBranding: merchant.hidePlatformBranding,
        createdAt: merchant.createdAt,
      })
      .from(merchant)
      .where(eq(merchant.id, me.merchantId))
    return NextResponse.json(paginateResponse(rows, rows.length))
  }

  // Riders resolve merchant names + phones on their pickup/delivery pages, so
  // they still get a list — but only the fields they need (no NID, no rates,
  // no billing contact).
  if (me.role === "RIDER") {
    const rows = await dbRead
      .select({
        id: merchant.id,
        businessName: merchant.businessName,
        phone: merchant.phone,
        status: merchant.status,
      })
      .from(merchant)
      .orderBy(asc(merchant.businessName))
    return NextResponse.json(paginateResponse(rows, rows.length))
  }

  // Warehouse admins resolve merchant names on their order/intake work tables,
  // so they get the same light projection as riders (no NID, no rates, no
  // balance, no billing contact). Approval/NID review stays with SUPER_ADMIN.
  if (me.role === "WAREHOUSE_ADMIN") {
    const rows = await dbRead
      .select({
        id: merchant.id,
        businessName: merchant.businessName,
        phone: merchant.phone,
        status: merchant.status,
      })
      .from(merchant)
      .orderBy(asc(merchant.businessName))
    return NextResponse.json(paginateResponse(rows, rows.length))
  }

  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })
  const search = new URL(req.url).searchParams.get("q")?.trim()
  let where = search
    ? or(
        ilike(merchant.businessName, `%${search}%`),
        ilike(merchant.ownerName, `%${search}%`),
        ilike(merchant.email, `%${search}%`),
        ilike(merchant.phone, `%${search}%`),
        ilike(merchant.nidNumber, `%${search}%`),
      )
    : undefined

  const statuses = parseStatusFilter(req, merchantStatuses)
  if (statuses.length > 0) {
    const statusClause = inArray(
      merchant.status,
      enumValues<(typeof merchantStatuses)[number]>(statuses),
    )
    where = where ? and(where, statusClause) : statusClause
  }

  const nidStatus = new URL(req.url).searchParams.get("nidStatus")?.trim()
  if (nidStatus === "pending") {
    const nidClause = and(
      sql`${merchant.nidSubmittedAt} IS NOT NULL`,
      sql`${merchant.nidVerifiedAt} IS NULL`,
      sql`${merchant.nidRejectedAt} IS NULL`,
    )
    where = where ? and(where, nidClause) : nidClause
  } else if (nidStatus === "verified") {
    const nidClause = sql`${merchant.nidVerifiedAt} IS NOT NULL`
    where = where ? and(where, nidClause) : nidClause
  } else if (nidStatus === "rejected") {
    const nidClause = sql`${merchant.nidRejectedAt} IS NOT NULL`
    where = where ? and(where, nidClause) : nidClause
  } else if (nidStatus === "not_submitted") {
    const nidClause = sql`${merchant.nidSubmittedAt} IS NULL`
    where = where ? and(where, nidClause) : nidClause
  }

  const emailVerified = new URL(req.url).searchParams
    .get("emailVerified")
    ?.trim()
  if (emailVerified === "true") {
    const clause = sql`${merchant.emailVerifiedAt} IS NOT NULL`
    where = where ? and(where, clause) : clause
  } else if (emailVerified === "false") {
    const clause = sql`${merchant.emailVerifiedAt} IS NULL`
    where = where ? and(where, clause) : clause
  }

  let q = dbRead
    .select({
      id: merchant.id,
      businessName: merchant.businessName,
      ownerName: merchant.ownerName,
      email: merchant.email,
      phone: merchant.phone,
      address: merchant.address,
      status: merchant.status,
      emailVerifiedAt: merchant.emailVerifiedAt,
      phoneVerifiedAt: merchant.phoneVerifiedAt,
      approvedBy: merchant.approvedBy,
      approvedAt: merchant.approvedAt,
      createdAt: merchant.createdAt,
      nidSubmittedAt: merchant.nidSubmittedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
      nidRejectedAt: merchant.nidRejectedAt,
      nidRejectedBy: merchant.nidRejectedBy,
      nidRejectionReason: merchant.nidRejectionReason,
      nidNumber: merchant.nidNumber,
      balance: merchantBalance.balance,
      pendingBalance: merchantBalance.pendingBalance,
    })
    .from(merchant)
    .leftJoin(merchantBalance, eq(merchantBalance.merchantId, merchant.id))
    .$dynamic()
  if (where) q = q.where(where)

  const countQuery = dbRead
    .select({ count: sql<number>`count(*)::int` })
    .from(merchant)
    .where(where)

  const sortColumnMap = {
    business: merchant.businessName,
    owner: merchant.ownerName,
    status: merchant.status,
    balance: merchantBalance.balance,
    createdAt: merchant.createdAt,
  }
  const sort = parseSort(req, sortColumnMap)
  if (sort) {
    q =
      sort.direction === "asc"
        ? q.orderBy(asc(sort.column))
        : q.orderBy(desc(sort.column))
  } else {
    // Stable default so OFFSET paging cannot repeat or skip rows.
    q = q.orderBy(desc(merchant.createdAt), desc(merchant.id))
  }

  if (limit !== undefined) q = q.limit(limit)
  if (offset !== undefined) q = q.offset(offset)

  // COUNT and data fetch are independent — run them in parallel.
  const [[{ count }], rows] = await Promise.all([countQuery, q])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

/** Best-effort removal of the auth user created for a failed registration. */
async function deleteUserQuietly(userId: string): Promise<void> {
  try {
    await db.delete(user).where(eq(user.id, userId))
  } catch (err) {
    logger.error("Orphan user cleanup failed", { err })
  }
}

export const POST = withErrorHandler(async (req: Request) => {
  const parsed = await parseBody(req, merchantRegisterSchema)
  if (parsed.error) return parsed.error
  const {
    businessName,
    ownerName,
    email,
    phone,
    address,
    businessType,
    password,
  } = parsed.data

  const limited = await rateLimitByIp(req, "merchant-register", 3, 60, {
    failClosed: true,
  })
  if (limited) return limited

  // Only the SHA-256 hash of the verification token is stored (P0.7); the raw
  // token exists only inside the emailed link.
  const {
    raw: verificationToken,
    hash: verificationTokenHash,
    expiresAt: verificationExpiresAt,
  } = issueVerifyToken()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const verificationUrl = verifyTokenUrl(verificationToken, siteUrl)

  // The merchant row and the owner's profile are one unit (ROADMAP P1.4).
  // Better Auth owns its own connection, so the user is created first and the
  // two app tables are written in a transaction; a failure deletes the user
  // instead of leaving an account with no merchant.
  let created
  try {
    created = await auth.api.createUser({
      body: { name: ownerName, email, password, role: "MERCHANT" as "user" },
    })
  } catch (err) {
    logger.error("Failed to create user account", { err })
    return badRequest("Could not create user account")
  }

  let newMerchant
  try {
    newMerchant = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(merchant)
        .values({
          businessName,
          ownerName,
          email,
          phone,
          address,
          businessType,
          status: "PENDING",
          // Deliberately the column default, not a platform default: the weight
          // cap is a per-merchant limit, not a rate. Delivery/COD/cancellation
          // fees come from `zone_pricing` per lane, so there is no platform
          // pricing row to copy here any more.
          emailVerificationToken: verificationTokenHash,
          emailVerificationExpiresAt: verificationExpiresAt,
        })
        .returning()

      await tx.insert(profile).values({
        userId: created.user.id,
        role: "MERCHANT",
        phone,
        isActive: true,
        merchantId: row.id,
      })

      // Enqueue the verification email in the same transaction (ROADMAP P1.5).
      const template = await merchantRegisteredTemplate({
        ownerName,
        businessName,
        verificationUrl,
      })
      await enqueueEmail({ to: email, ...template }, tx)

      return row
    })
  } catch (err) {
    await deleteUserQuietly(created.user.id)
    logger.error("Failed to store merchant", { err })
    return NextResponse.json(
      { error: "Could not create the merchant. Please try again." },
      { status: 500 },
    )
  }

  // Best-effort immediate delivery; the cron retries anything left behind.
  await flushEmailOutbox()

  return NextResponse.json(newMerchant, { status: 201 })
})
