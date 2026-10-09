import { desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { merchant, webhookEndpoint } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, webhookEndpointCreateSchema } from "@/lib/validation"
import { generateWebhookSecret } from "@/lib/webhooks"
import { withErrorHandler } from "@/lib/with-error-handler"

const MAX_WEBHOOKS_PER_MERCHANT = 10

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

  const rows = await dbRead
    .select({
      id: webhookEndpoint.id,
      url: webhookEndpoint.url,
      events: webhookEndpoint.events,
      isActive: webhookEndpoint.isActive,
      failureCount: webhookEndpoint.failureCount,
      disabledAt: webhookEndpoint.disabledAt,
      lastDeliveredAt: webhookEndpoint.lastDeliveredAt,
      createdAt: webhookEndpoint.createdAt,
    })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.merchantId, me.merchantId))
    .orderBy(desc(webhookEndpoint.createdAt))

  return NextResponse.json({ endpoints: rows })
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

  const limited = await rateLimitByIp(req, "integrations-webhooks", 10, 60)
  if (limited) return limited

  const parsed = await parseBody(req, webhookEndpointCreateSchema)
  if (parsed.error) return parsed.error

  const { url, events } = parsed.data

  const merchantId = me.merchantId
  const secret = generateWebhookSecret()

  // Transaction: lock the merchant row so concurrent creates for the same
  // merchant serialize, preventing the check-then-insert TOCTOU race.
  // Mirrors the holder pattern in `payouts/[id]/approve`.
  const committed: {
    created: {
      id: string
      url: string
      events: string[]
    } | null
    capped: boolean
  } = { created: null, capped: false }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: merchant.id })
      .from(merchant)
      .where(eq(merchant.id, merchantId))
      .for("update")
      .limit(1)

    if (!locked) return

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.merchantId, merchantId))

    if (Number(count) >= MAX_WEBHOOKS_PER_MERCHANT) {
      committed.capped = true
      return
    }

    const [inserted] = await tx
      .insert(webhookEndpoint)
      .values({
        merchantId,
        url: url.trim(),
        secret,
        events,
      })
      .returning({
        id: webhookEndpoint.id,
        url: webhookEndpoint.url,
        events: webhookEndpoint.events,
      })

    committed.created = inserted
  })

  if (committed.capped) {
    return NextResponse.json(
      {
        error: `You can have at most ${MAX_WEBHOOKS_PER_MERCHANT} webhook endpoints. Remove an old one first.`,
      },
      { status: 400 },
    )
  }

  if (!committed.created) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
  }

  const created = committed.created

  // `secret` is shown once so the merchant can configure verification — which
  // they have to do, or every delivery is unauthenticated from their side.
  return NextResponse.json(
    { id: created.id, url: created.url, events: created.events, secret },
    { status: 201 },
  )
})
