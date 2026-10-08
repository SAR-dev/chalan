import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { webhookEndpoint } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = withErrorHandler(
  async (_req: Request, { params }: Ctx) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "MERCHANT" || !me.merchantId) return forbidden()

    const { id } = await params
    const [row] = await dbRead
      .select({
        id: webhookEndpoint.id,
        merchantId: webhookEndpoint.merchantId,
      })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, id))
      .limit(1)
    if (!row) return notFound()
    if (row.merchantId !== me.merchantId) return notFound()

    // Deleting the endpoint also removes its queued deliveries (cascade), so a
    // merchant who removes a broken URL does not keep paying for its backlog.
    await db
      .delete(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.id, id),
          eq(webhookEndpoint.merchantId, me.merchantId),
        ),
      )

    return NextResponse.json({ ok: true })
  },
)
