import { createHash, randomBytes } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, eq, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { account, merchant, profile, user } from "@/lib/db/schema"
import { enqueueEmail } from "@/lib/email-outbox"
import { accountActivationTemplate } from "@/lib/mail-templates"

// =============================================================================
// Account activation
//
// Staff accounts (merchant moderators + warehouse admins) are created by an
// admin/owner with a temporary password and start PENDING: login is rejected
// until the invitee opens the emailed single-use link and sets their own
// password. Only the SHA-256 hash of the token is stored; the raw token
// exists solely in the email. Shared by the moderators API and the team API.
// =============================================================================

export const ACTIVATION_TTL_HOURS = 24

/** Transaction handle as returned by `db.transaction()`. */
export type ActivationTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Thrown when a merchant's moderator quota is already full. Carries the
 *  numbers so the caller can render the exact `used/max` message. */
export class ModeratorQuotaError extends Error {
  constructor(
    readonly used: number,
    readonly max: number,
  ) {
    super(`Moderator limit reached (${used}/${max})`)
    this.name = "ModeratorQuotaError"
  }
}

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
export async function issueActivationToken(
  userId: string,
  // Pass the caller's transaction so the token is committed with the profile
  // Write it belongs to.
  tx?: ActivationTx,
): Promise<string> {
  const { raw, hash, expiresAt } = generateActivationToken()
  const runner = tx ?? db
  await runner
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

/** Persist the activation email to the outbox. Pass the
 *  caller's transaction so the invite and its email commit together; the
 *  caller flushes the outbox after commit. */
export async function sendActivationEmail(
  {
    to,
    userName,
    contextName,
    rawToken,
  }: {
    to: string
    userName: string
    contextName?: string
    rawToken: string
  },
  tx?: ActivationTx,
): Promise<void> {
  const template = await accountActivationTemplate({
    userName,
    contextName,
    activationUrl: activationUrl(rawToken),
  })
  await enqueueEmail({ to, ...template }, tx)
}

/**
 * Quota accounting: slots consumed for a merchant = ACTIVE + PENDING
 * moderators (a pending invite reserves its slot so no account can exist
 * that could never activate). DEACTIVATED moderators free their slot.
 * Pass `excludeUserId` at activation time so the invite being activated
 * doesn't count against itself.
 *
 * Pass `tx` to read inside the caller's transaction — required whenever the
 * Count protects a write.
 */
export async function countModeratorSlots(
  merchantId: string,
  excludeUserId?: string,
  tx?: ActivationTx,
): Promise<number> {
  const conditions = [
    eq(profile.merchantId, merchantId),
    eq(profile.isModerator, true),
    or(eq(profile.isActive, true), isNull(profile.activatedAt)),
  ]
  if (excludeUserId) conditions.push(ne(profile.userId, excludeUserId))
  const rows = await (tx ?? db)
    .select({ userId: profile.userId })
    .from(profile)
    .where(and(...conditions))
  return rows.length
}

/**
 * Lock the merchant row and re-check the quota — the atomic form of the old
 * count-then-write. `SELECT … FOR UPDATE` on `merchant` serializes every
 * moderator create/re-activate for that merchant, so two concurrent requests
 * cannot both observe the same free slot. MUST be called in the same
 * transaction as the profile insert/update it protects.
 *
 * @throws ModeratorQuotaError when there is no free slot.
 * @returns the locked merchant row, or null when the merchant does not exist.
 */
export async function lockModeratorQuota(
  tx: ActivationTx,
  merchantId: string,
  excludeUserId?: string,
): Promise<{ maxModerators: number; used: number } | null> {
  const [merchantRow] = await tx
    .select({ maxModerators: merchant.maxModerators })
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .for("update")
    .limit(1)
  if (!merchantRow) return null

  const used = await countModeratorSlots(merchantId, excludeUserId, tx)
  if (used >= merchantRow.maxModerators) {
    throw new ModeratorQuotaError(used, merchantRow.maxModerators)
  }
  return { maxModerators: merchantRow.maxModerators, used }
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
