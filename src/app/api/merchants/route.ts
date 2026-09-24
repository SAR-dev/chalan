import { createId } from "@paralleldrive/cuid2"
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, unauthorized } from "@/lib/api-response"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import {
  merchant,
  merchantBalance,
  merchantStatuses,
  platformConfig,
  profile,
} from "@/lib/db/schema"
import { enumValues } from "@/lib/db-helpers"
import { merchantRegisteredTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import {
  paginateResponse,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"
import { rateLimitByIp } from "@/lib/rate-limit"
import { merchantRegisterSchema, parseBody } from "@/lib/validation"
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
        onboardingCompletedAt: merchant.onboardingCompletedAt,
        emailVerifiedAt: merchant.emailVerifiedAt,
        phoneVerifiedAt: merchant.phoneVerifiedAt,
        baseRate: merchant.baseRate,
        extraRatePerKg: merchant.extraRatePerKg,
        maxWeightKg: merchant.maxWeightKg,
        freeWeightKg: merchant.freeWeightKg,
        nidSubmittedAt: merchant.nidSubmittedAt,
        nidVerifiedAt: merchant.nidVerifiedAt,
        nidRejectedAt: merchant.nidRejectedAt,
        logoUrl: merchant.logoUrl,
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

  const { limit, offset } = parsePagination(req)
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
      baseRate: merchant.baseRate,
      extraRatePerKg: merchant.extraRatePerKg,
      maxWeightKg: merchant.maxWeightKg,
      freeWeightKg: merchant.freeWeightKg,
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
    .select({ count: sql<number>`count(*)` })
    .from(merchant)
    .where(where)

  const sortColumnMap = {
    business: merchant.businessName,
    owner: merchant.ownerName,
    status: merchant.status,
    baseRate: merchant.baseRate,
    perKg: merchant.extraRatePerKg,
    balance: merchantBalance.balance,
    createdAt: merchant.createdAt,
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
  const [[{ count }], rows] = await Promise.all([countQuery, q])

  return NextResponse.json(paginateResponse(rows, count, limit, offset))
})

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

  const limited = await rateLimitByIp(req, "merchant-register", 3, 60)
  if (limited) return limited

  const TOKEN_EXPIRY_HOURS = 24
  const verificationToken = createId()
  const verificationExpiresAt = new Date(
    Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString()

  const config = await dbRead
    .select({
      defaultBaseRate: platformConfig.defaultBaseRate,
      defaultExtraRatePerKg: platformConfig.defaultExtraRatePerKg,
      defaultFreeWeightKg: platformConfig.defaultFreeWeightKg,
      defaultMaxWeightKg: platformConfig.defaultMaxWeightKg,
    })
    .from(platformConfig)
    .where(eq(platformConfig.id, "default"))
    .limit(1)
    .then((r) => r[0])

  const [newMerchant] = await db
    .insert(merchant)
    .values({
      businessName,
      ownerName,
      email,
      phone,
      address,
      businessType,
      status: "PENDING",
      baseRate: config?.defaultBaseRate ?? 0,
      extraRatePerKg: config?.defaultExtraRatePerKg ?? 0,
      freeWeightKg: config?.defaultFreeWeightKg ?? 1,
      maxWeightKg: config?.defaultMaxWeightKg ?? 3,
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiresAt,
    })
    .returning()

  let created
  try {
    created = await auth.api.createUser({
      body: { name: ownerName, email, password, role: "MERCHANT" as "user" },
    })
  } catch (err) {
    await db.delete(merchant).where(eq(merchant.id, newMerchant.id))
    console.error("[merchants] Failed to create user account:", err)
    return badRequest("Could not create user account")
  }

  await db.insert(profile).values({
    userId: created.user.id,
    role: "MERCHANT",
    phone,
    isActive: true,
    merchantId: newMerchant.id,
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const verificationUrl = `${siteUrl}/api/auth/verify-email?token=${verificationToken}`

  const template = await merchantRegisteredTemplate({
    ownerName,
    businessName,
    verificationUrl,
  })

  sendMail(
    {
      to: email,
      ...template,
    },
    {
      maxRetries: 2,
      baseDelayMs: 1000,
      onRetry: (attempt, err) =>
        console.warn(
          `[mailer] Retry ${attempt} for merchant registration email (${email}):`,
          err.message,
        ),
    },
  ).catch((err) =>
    console.error("[mailer] Merchant registration email failed:", err),
  )

  return NextResponse.json(newMerchant, { status: 201 })
})
