import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { webhookEndpoint } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, webhookEndpointCreateSchema } from "@/lib/validation"
import { generateWebhookSecret, isWebhookEvent } from "@/lib/webhooks"
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
  for (const e of events) {
    if (!isWebhookEvent(e)) {
      return NextResponse.json(
        { error: `Unknown event: ${e}` },
        { status: 400 },
      )
    }
  }

  const [{ count }] = await dbRead
    .select({ count: webhookEndpoint.id })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.merchantId, me.merchantId))
    .then((rows) => [{ count: rows.length }])
  if (count >= MAX_WEBHOOKS_PER_MERCHANT) {
    return NextResponse.json(
      {
        error: `You can have at most ${MAX_WEBHOOKS_PER_MERCHANT} webhook endpoints. Remove an old one first.`,
      },
      { status: 400 },
    )
  }

  const secret = generateWebhookSecret()
  const [created] = await db
    .insert(webhookEndpoint)
    .values({
      merchantId: me.merchantId,
      url: url.trim(),
      secret,
      events,
    })
    .returning({
      id: webhookEndpoint.id,
      url: webhookEndpoint.url,
      events: webhookEndpoint.events,
    })

  // `secret` is shown once so the merchant can configure verification — which
  // they have to do, or every delivery is unauthenticated from their side.
  return NextResponse.json(
    { id: created.id, url: created.url, events: created.events, secret },
    { status: 201 },
  )
})
