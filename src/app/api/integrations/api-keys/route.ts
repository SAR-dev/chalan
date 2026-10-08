import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { API_KEY_SCOPES, generateApiKey, isApiKeyScope } from "@/lib/api-keys"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { apiKey } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { apiKeyCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const MAX_KEYS_PER_MERCHANT = 10

/**
 * Merchant API keys (R2) — merchant-scoped, session-authenticated.
 *
 * The merchant is derived from the session, never from the body, so a key
 * list cannot be pointed at another merchant. A revoked key is not deleted —
 * it survives as an audit trail.
 */
export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

  const rows = await dbRead
    .select({
      id: apiKey.id,
      label: apiKey.label,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      revokedAt: apiKey.revokedAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.merchantId, me.merchantId))
    .orderBy(desc(apiKey.createdAt))

  return NextResponse.json({ keys: rows })
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

  const limited = await rateLimitByIp(req, "integrations-api-keys", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, apiKeyCreateSchema)
  if (parsed.error) return parsed.error

  const { label, scopes, environment } = parsed.data
  // Defensive: Zod already checks, but a hand-crafted JSON array of strings
  // could still carry a value outside the declared scopes — reject it rather
  // than persisting a capability the server never honours.
  for (const s of scopes) {
    if (!isApiKeyScope(s)) {
      return NextResponse.json(
        { error: `Unknown scope: ${s}. Allowed: ${API_KEY_SCOPES.join(", ")}` },
        { status: 400 },
      )
    }
  }

  const [{ count }] = await dbRead
    .select({ count: apiKey.id })
    .from(apiKey)
    .where(eq(apiKey.merchantId, me.merchantId))
    .then((rows) => [{ count: rows.length }])

  if (count >= MAX_KEYS_PER_MERCHANT) {
    return NextResponse.json(
      {
        error: `You can have at most ${MAX_KEYS_PER_MERCHANT} API keys. Revoke an old one first.`,
      },
      { status: 400 },
    )
  }

  const env = environment ?? "live"
  const { plaintext, hash, prefix } = generateApiKey(env)

  const [created] = await db
    .insert(apiKey)
    .values({
      merchantId: me.merchantId,
      label: label.trim(),
      prefix,
      keyHash: hash,
      scopes,
    })
    .returning({ id: apiKey.id })

  // `plaintext` is returned exactly once — there is no endpoint that can
  // produce it a second time, because the column storing it does not exist.
  return NextResponse.json(
    { id: created.id, plaintext, prefix, label: label.trim(), scopes },
    { status: 201 },
  )
})
