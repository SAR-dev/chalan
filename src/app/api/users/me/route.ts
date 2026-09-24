import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { notFound, unauthorized } from "@/lib/api-response"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { parseBody, profileUpdateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// Serializes a Better Auth user row + its profile row into the app-level User
// shape consumed by the client (mirrors the GET response below).
function serializeUser(
  u: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
    createdAt: string | Date
    updatedAt: string | Date
  },
  row: typeof profile.$inferSelect,
  merchantEmailVerifiedAt?: string | null,
) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    image: u.image ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    role: row.role,
    phone: row.phone,
    isActive: row.isActive,
    tableRowsPerPage: row.tableRowsPerPage,
    warehouseId: row.warehouseId,
    merchantId: row.merchantId,
    riderId: row.riderId,
    emailVerifiedAt: merchantEmailVerifiedAt ?? null,
  }
}

export const GET = withErrorHandler(async (

) => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return unauthorized()
  }

  const [row] = await dbRead
    .select({
      userId: profile.userId,
      role: profile.role,
      phone: profile.phone,
      isActive: profile.isActive,
      tableRowsPerPage: profile.tableRowsPerPage,
      warehouseId: profile.warehouseId,
      merchantId: profile.merchantId,
      riderId: profile.riderId,
      createdAt: profile.createdAt,
    })
    .from(profile)
    .where(eq(profile.userId, session.user.id))
    .limit(1)

  if (!row) {
    return notFound()
  }

  // For merchants, fetch emailVerifiedAt from the merchant table
  let merchantEmailVerifiedAt: string | null = null
  if (row.role === "MERCHANT" && row.merchantId) {
    const [merchantRow] = await dbRead
      .select({ emailVerifiedAt: merchant.emailVerifiedAt })
      .from(merchant)
      .where(eq(merchant.id, row.merchantId))
      .limit(1)
    merchantEmailVerifiedAt = merchantRow?.emailVerifiedAt ?? null
  }

  return NextResponse.json(
    serializeUser(session.user, row, merchantEmailVerifiedAt),
  )
})


// Update the signed-in user's own profile: display name, avatar (both on the
// `user` row), and/or table rows-per-page preference (on `profile`).
export const PATCH = withErrorHandler(async (
req: Request
) => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return unauthorized()
  }

  const parsed = await parseBody(req, profileUpdateSchema)
  if (parsed.error) return parsed.error
  const { name, image, phone, tableRowsPerPage } = parsed.data

  // Transaction: the name/image write (user table) and the rows-per-page
  // write (profile table) are two tables backing one logical "update my
  // account" action — keep them atomic even though today's UI only ever
  // sends one group at a time.
  const result = await db.transaction(async (tx) => {
    let updatedUser: Parameters<typeof serializeUser>[0] = session.user
    if (name !== undefined || image !== undefined) {
      const userUpdates: {
        name?: string
        image?: string | null
        updatedAt: string
      } = { updatedAt: new Date().toISOString() }
      if (name !== undefined) userUpdates.name = name
      if (image !== undefined) userUpdates.image = image
      const [row] = await tx
        .update(user)
        .set(userUpdates)
        .where(eq(user.id, session.user.id))
        .returning()
      updatedUser = { ...session.user, ...row }
    }

    if (phone !== undefined || tableRowsPerPage !== undefined) {
      const profileUpdates: {
        phone?: string
        tableRowsPerPage?: number
      } = {}
      if (phone !== undefined) profileUpdates.phone = phone
      if (tableRowsPerPage !== undefined)
        profileUpdates.tableRowsPerPage = tableRowsPerPage
      await tx
        .update(profile)
        .set(profileUpdates)
        .where(eq(profile.userId, session.user.id))
    }

    const [profileRow] = await tx
      .select({
        userId: profile.userId,
        role: profile.role,
        phone: profile.phone,
        isActive: profile.isActive,
        tableRowsPerPage: profile.tableRowsPerPage,
        warehouseId: profile.warehouseId,
        merchantId: profile.merchantId,
        riderId: profile.riderId,
        createdAt: profile.createdAt,
      })
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)

    return { updatedUser, profileRow }
  })

  if (!result.profileRow) {
    return notFound("Profile not found")
  }

  // For merchants, fetch emailVerifiedAt from the merchant table
  let merchantEmailVerifiedAt: string | null = null
  if (result.profileRow.role === "MERCHANT" && result.profileRow.merchantId) {
    const [merchantRow] = await dbRead
      .select({ emailVerifiedAt: merchant.emailVerifiedAt })
      .from(merchant)
      .where(eq(merchant.id, result.profileRow.merchantId))
      .limit(1)
    merchantEmailVerifiedAt = merchantRow?.emailVerifiedAt ?? null
  }

  return NextResponse.json(
    serializeUser(
      result.updatedUser,
      result.profileRow,
      merchantEmailVerifiedAt,
    ),
  )
})

