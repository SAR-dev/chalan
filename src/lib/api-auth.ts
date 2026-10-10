import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { cache } from "react"
import { auth } from "@/lib/auth" // ← was missing
// Session resolution is a read, so it belongs on the read pool: running it on
// `db` cost every API request a session + profile⋈user⋈merchant join on the
// Primary before the route's own query ran. `dbRead` falls
// back to the primary when no replica is configured, so behaviour is unchanged
// on a default deploy.
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { isRoleAllowedIn, parsePortalMode } from "@/lib/portal-mode"
import {
  isTwoFactorRequiredByPolicy,
  sessionBlockReason,
} from "@/lib/session-policy"

// `lenient` skips the policy gates (banned / 2FA enrolment / merchant email
// verification) that moved server-side. It exists for the
// account-state endpoints an account must be able to read *in order to
// resolve* the blocked state (which is how the client learns it should send
// the user to 2FA setup or the verification email). `cache()` keys on the
// primitive, so both variants memoize per request.
const loadSession = cache(async (lenient: boolean) => {
  const hdrs = await headers()
  const session = await auth.api.getSession({ headers: hdrs }) // ← replaces manual token extraction + DB query
  if (!session?.user) return null

  const [row] = await db
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
      // When the user last visited the announcements feed — the badge's
      // "new since" watermark (see src/lib/announcements.ts).
      announcementsSeenAt: profile.announcementsSeenAt,
      notificationsSeenAt: profile.notificationsSeenAt,
      createdAt: profile.createdAt,
      name: user.name,
      banned: user.banned,
      twoFactorEnabled: user.twoFactorEnabled,
      // Left join: non-merchant sessions simply get null here.
      emailVerifiedAt: merchant.emailVerifiedAt,
    })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .leftJoin(merchant, eq(merchant.id, profile.merchantId))
    .where(eq(profile.userId, session.user.id))
    .limit(1)

  if (!row) return null

  // Deactivated / pending accounts get no API access at all.
  // PENDING staff (isActive=false, never activated) and disabled team members
  // are treated as unauthenticated — every route surfaces 401 and the client
  // runs the standard automatic-logout redirect.
  if (row.isActive === false) return null

  // Portal-mode gate: roles outside this deployment's
  // PORTAL_MODE are treated as unauthenticated (routes surface 401), so a
  // stray session can't call shared APIs. Default `all` keeps behavior
  // unchanged.
  if (!isRoleAllowedIn(row.role, parsePortalMode(process.env.PORTAL_MODE))) {
    return null
  }

  // Server-side policy gates. These used to live only in the
  // browser — the dashboard/warehouse shells redirected unenrolled admins and
  // `use-auth` refused unverified merchants — so an API caller could skip them
  // entirely. `requireSession` now treats a policy-blocked session as
  // unauthenticated: routes 401, and the account-state endpoint (which uses
  // the lenient variant) still reports the state so the client can redirect.
  if (!lenient) {
    const blocked = sessionBlockReason({
      role: row.role,
      banned: row.banned,
      twoFactorEnabled: row.twoFactorEnabled,
      emailVerifiedAt: row.emailVerifiedAt,
      twoFactorRequired: isTwoFactorRequiredByPolicy(),
    })
    if (blocked) return null
  }

  return {
    ...row,
    // Admin impersonation is audit-relevant: callers that write audit rows
    // Should record who is really driving.
    impersonatedBy: session.session?.impersonatedBy ?? null,
  }
})

/** The strict gate used by every route: policy-blocked sessions get a 401. */
export const requireSession = () => loadSession(false)

/**
 * Account-state gate: same session, but the 2FA-enrolment and merchant
 * email-verification policies do not apply. Reserved for endpoints that must
 * work *while* the account is blocked (reading `/api/users/me` to render the
 * redirect, and the 2FA account endpoints themselves).
 */
export const requireSessionForAccountState = () => loadSession(true)
