import { createHash, randomBytes } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, eq, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { account, profile, user } from "@/lib/db/schema"
import { accountActivationTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"

// =============================================================================
// Account activation (ROADMAP 5.2)
//
// Staff accounts (merchant moderators + warehouse admins) are created by an
// admin/owner with a temporary password and start PENDING: login is rejected
// until the invitee opens the emailed single-use link and sets their own
// password. Only the SHA-256 hash of the token is stored; the raw token
// exists solely in the email. Shared by the moderators API and the team API.
// =============================================================================

export const ACTIVATION_TTL_HOURS = 24

export function hashActivationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Fresh single-use token: raw (emailed), hash (stored), expiry. */
export function generateActivationToken(): {
  raw: string
  hash: string
  expiresAt: Date
} {
  const raw = randomBytes(32).toString("hex")
  return {
    raw,
    hash: hashActivationToken(raw),
    expiresAt: new Date(Date.now() + ACTIVATION_TTL_HOURS * 60 * 60 * 1000),
  }
}

/** Persist a new activation token for the user (overwriting any previous
 *  one) and return the raw token for the email link. */
export async function issueActivationToken(userId: string): Promise<string> {
  const { raw, hash, expiresAt } = generateActivationToken()
  await db
    .update(user)
    .set({
      activationToken: hash,
      activationTokenExpiresAt: expiresAt.toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(user.id, userId))
  return raw
}

/** Resolve a raw token to its user row. Returns null for unknown or
 *  expired tokens — callers surface a single generic 400 either way. */
export async function findUserByActivationToken(
  raw: string,
): Promise<typeof user.$inferSelect | null> {
  const hash = hashActivationToken(raw)
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.activationToken, hash))
    .limit(1)
  if (!row) return null
  if (
    !row.activationTokenExpiresAt ||
    new Date(row.activationTokenExpiresAt).getTime() < Date.now()
  ) {
    return null
  }
  return row
}

/** Public page URL carried by the activation email. */
export function activationUrl(rawToken: string, siteUrl?: string): string {
  const base =
    siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  return `${base}/activate?token=${encodeURIComponent(rawToken)}`
}

/** Fire-and-forget activation email — same posture as the other
 *  mail-logging callers: SMTP failures never fail the inviting request. */
export async function sendActivationEmail({
  to,
  userName,
  contextName,
  rawToken,
}: {
  to: string
  userName: string
  contextName?: string
  rawToken: string
}): Promise<void> {
  const template = await accountActivationTemplate({
    userName,
    contextName,
    activationUrl: activationUrl(rawToken),
  })
  sendMail({ to, ...template }).catch((err) =>
    console.error("[mailer] Activation email failed:", err),
  )
}

/**
 * Quota accounting: slots consumed for a merchant = ACTIVE + PENDING
 * moderators (a pending invite reserves its slot so no account can exist
 * that could never activate). DEACTIVATED moderators free their slot.
 * Pass `excludeUserId` at activation time so the invite being activated
 * doesn't count against itself.
 */
export async function countModeratorSlots(
  merchantId: string,
  excludeUserId?: string,
): Promise<number> {
  const conditions = [
    eq(profile.merchantId, merchantId),
    eq(profile.isModerator, true),
    or(eq(profile.isActive, true), isNull(profile.activatedAt)),
  ]
  if (excludeUserId) conditions.push(ne(profile.userId, excludeUserId))
  const rows = await db
    .select({ userId: profile.userId })
    .from(profile)
    .where(and(...conditions))
  return rows.length
}

/** Mark the account ACTIVE: set the credential, verify the email, clear the
 *  token. Runs in one transaction so a partial activation can't happen. */
export async function activateAccount({
  userId,
  password,
}: {
  userId: string
  password: string
}): Promise<void> {
  const hashed = await hashPassword(password)
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: hashed, updatedAt: now })
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential")),
      )
    await tx
      .update(user)
      .set({
        emailVerified: true,
        activationToken: null,
        activationTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(user.id, userId))
    await tx
      .update(profile)
      .set({ isActive: true, activatedAt: now })
      .where(eq(profile.userId, userId))
  })
}

/** Account lifecycle derived from isActive + activatedAt (never stored —
 *  computed at read time so the three states can't drift apart). */
export function accountStatus(row: {
  isActive: boolean
  activatedAt: string | null
}): "ACTIVE" | "PENDING" | "DEACTIVATED" {
  if (row.isActive) return "ACTIVE"
  return row.activatedAt ? "DEACTIVATED" : "PENDING"
}
