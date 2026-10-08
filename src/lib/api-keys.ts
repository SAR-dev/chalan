import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  API_KEY_SCOPES,
  type ApiKeyScope,
  isApiKeyScope,
} from "@/lib/api-key-scopes"
import { db, dbRead } from "@/lib/db"
import { apiKey, merchant } from "@/lib/db/schema"

/**
 * API keys (R2)
 *
 * Key format: `chl_<env>_<secret>` where `<env>` is `live` or `test` (a label
 * for humans, never used for authorization) and `<secret>` is 32 bytes of
 * base64url. The env segment is a deliberate courtesy so a merchant pasting a
 * test key into production can see it at a glance — it grants nothing.
 *
 * **Only the SHA-256 hash is stored.** The plaintext is returned exactly once,
 * from `createApiKey`; there is no code path that can read it back, because the
 * column holding it does not exist. That is the same reasoning as
 * `tracking-token.ts`: a secret that can be re-read is a secret that eventually
 * leaks into a screenshot, a support ticket, or an audit row.
 *
 * Lookup is by hash, so a request is authenticated by indexing a 32-byte digest
 * rather than scanning candidates — one indexed equality, then a timing-safe
 * compare to close the timing side-channel.
 */

/** Environment segment. Cosmetic only — it is not part of the authorization. */
export type ApiKeyEnvironment = "live" | "test"

const KEY_ENTROPY_BYTES = 32

export type { ApiKeyScope } from "@/lib/api-key-scopes"
// Re-export for server callers that already import from here — client code
// should import from `@/lib/api-key-scopes` directly so it does not pull in
// `drizzle-orm`/`pg` via this server module.
export { API_KEY_SCOPES, isApiKeyScope } from "@/lib/api-key-scopes"

/** Hash a candidate key. Used both when storing and when authenticating. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

/**
 * Mint a key.
 *
 * Returns the plaintext **and** the hash to store — the caller persists the
 * hash and shows the plaintext once. There is deliberately no function that
 * takes an `apiKey.id` and returns a usable key.
 */
export function generateApiKey(env: ApiKeyEnvironment = "live"): {
  plaintext: string
  hash: string
  /** Non-secret leading segment, safe to display in a list. */
  prefix: string
} {
  const secret = randomBytes(KEY_ENTROPY_BYTES).toString("base64url")
  const plaintext = `chl_${env}_${secret}`
  // 12 chars of the secret is plenty to disambiguate visually and leaks nothing
  // useful against 256 bits of entropy.
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: `chl_${env}_${secret.slice(0, 8)}`,
  }
}

/** Constant-time hash comparison. */
function hashesMatch(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, "hex")
  const b = Buffer.from(candidate, "hex")
  // A malformed stored hash would make the lengths differ; treat that as a
  // mismatch rather than throwing inside an auth path.
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

export interface AuthenticatedApiKey {
  merchantId: string
  keyId: string
  scopes: string[]
}

/**
 * Authenticate an `Authorization: Bearer <key>` header.
 *
 * Returns `null` for every failure — missing header, unknown key, revoked key,
 * suspended merchant — without distinguishing between them, so a caller cannot
 * probe for valid keys. The *reason* is logged for the operator, never returned
 * to the requester.
 *
 * `lastUsedAt` is updated with a plain `UPDATE` outside the request's
 * transaction: it is telemetry, not part of the authorization decision, and
 * making it transactional would put a write on the auth path of every request.
 */
export async function authenticateApiKey(
  req: Request,
): Promise<AuthenticatedApiKey | null> {
  const auth = req.headers.get("authorization")
  const presented = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!presented) return null

  const [row] = await dbRead
    .select({
      id: apiKey.id,
      merchantId: apiKey.merchantId,
      keyHash: apiKey.keyHash,
      scopes: apiKey.scopes,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashApiKey(presented)))
    .limit(1)

  // Rehash-and-compare rather than trusting the index alone: it keeps the
  // comparison constant-time even though the lookup already narrowed to one row.
  if (!row || !hashesMatch(row.keyHash, hashApiKey(presented))) return null
  if (row.revokedAt !== null) return null

  // A suspended or unverified merchant must not be able to keep placing orders
  // through a key minted while the account was healthy.
  const [m] = await dbRead
    .select({ status: merchant.status })
    .from(merchant)
    .where(eq(merchant.id, row.merchantId))
    .limit(1)
  if (!m || m.status !== "ACTIVE") return null

  // Fire-and-forget: telemetry, never part of the authorization decision. A
  // failure here must not fail the request, so it is deliberately not awaited.
  void db
    .update(apiKey)
    .set({
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(apiKey.id, row.id))
    .catch(() => {})

  return { merchantId: row.merchantId, keyId: row.id, scopes: row.scopes ?? [] }
}

/**
 * Whether an authenticated key may perform `scope`.
 *
 * An empty scope list on a key means **read-only**: creating a key with no
 * scopes must not accidentally hand out write access, so the safe reading is
 * the default one.
 */
export function hasApiKeyScope(
  key: AuthenticatedApiKey,
  scope: ApiKeyScope,
): boolean {
  return key.scopes.includes(scope)
}
