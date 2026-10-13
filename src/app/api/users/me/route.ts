import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { notFound, unauthorized } from "@/lib/api-response"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { isRoleAllowedIn, parsePortalMode } from "@/lib/portal-mode"
import { isAdminRole } from "@/lib/two-factor"
import { parseBody, profileUpdateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// 2FA state for the signed-in user. `twoFactorEnabled` is read
// straight from the `user` table — never from the Better Auth session, which
// can serve a cached user row for up to cookie-cache maxAge after enrolment
// changed. `twoFactorRequired` is deployment policy: the ADMIN_2FA_REQUIRED
// env var, applied to admin roles only (merchants/riders may opt in, but are
// never forced).
async function loadTwoFactorFlags(userId: string, role: string) {
  const [userRow] = await dbRead
    .select({ twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return {
    twoFactorEnabled: userRow?.twoFactorEnabled === true,
    twoFactorRequired:
      isAdminRole(role) && process.env.ADMIN_2FA_REQUIRED === "1",
  }
}

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
  twoFactor?: { twoFactorEnabled: boolean; twoFactorRequired: boolean },
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
    isModerator: row.isModerator,
    moderatorPermissions: row.moderatorPermissions ?? null,
    activatedAt: row.activatedAt ?? null,
    // PENDING staff (created by an owner/admin, activation link not yet
    // clicked) - the login page shows the "check your email" panel instead
    // of the generic deactivated error.
    pendingActivation: row.isActive === false && !row.activatedAt,
    emailVerifiedAt: merchantEmailVerifiedAt ?? null,
    twoFactorEnabled: twoFactor?.twoFactorEnabled ?? false,
    twoFactorRequired: twoFactor?.twoFactorRequired ?? false,
    // Portal-mode gate: false when this role is outside the
    // deployment's PORTAL_MODE. Deliberately NOT a 403 — the client needs the
    // payload to explain and sign the user out cleanly; APIs 401 via
    // requireSession().
    portalAllowed: isRoleAllowedIn(
      row.role,
      parsePortalMode(process.env.PORTAL_MODE),
    ),
  }
}

export const GET = withErrorHandler(async () => {
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
      isModerator: profile.isModerator,
      moderatorPermissions: profile.moderatorPermissions,
      activatedAt: profile.activatedAt,
      announcementsSeenAt: profile.announcementsSeenAt,
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

  const twoFactor = await loadTwoFactorFlags(session.user.id, row.role)

  return NextResponse.json(
    serializeUser(session.user, row, merchantEmailVerifiedAt, twoFactor),
  )
})

// Update the signed-in user's own profile: display name, avatar (both on the
// `user` row), and/or table rows-per-page preference (on `profile`).
export const PATCH = withErrorHandler(async (req: Request) => {
  // Strict gate. The GET above is deliberately lenient (it reports
  // `pendingActivation` / `portalAllowed` so the client can explain the block),
  // but *mutating* the profile must be refused for a deactivated, banned or
  // policy-blocked account — otherwise a stale session can keep writing.
  const me = await requireSession()
  if (!me) return unauthorized()

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
        isModerator: profile.isModerator,
        moderatorPermissions: profile.moderatorPermissions,
        activatedAt: profile.activatedAt,
        announcementsSeenAt: profile.announcementsSeenAt,
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

  const twoFactor = await loadTwoFactorFlags(
    session.user.id,
    result.profileRow.role,
  )

  return NextResponse.json(
    serializeUser(
      result.updatedUser,
      result.profileRow,
      merchantEmailVerifiedAt,
      twoFactor,
    ),
  )
})
