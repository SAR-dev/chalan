import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { deliveryZone } from "@/lib/db/schema"
import { deliveryZoneUpdateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const parsed = await parseBody(req, deliveryZoneUpdateSchema)
    if (parsed.error) return parsed.error

    const [updated] = await db
      .update(deliveryZone)
      .set({
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(deliveryZone.id, id))
      .returning()

    if (!updated) return notFound()
    return NextResponse.json(updated)
  },
)

export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const [updated] = await db
      .update(deliveryZone)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(deliveryZone.id, id))
      .returning()

    if (!updated) return notFound()
    return NextResponse.json({ ok: true })
  },
)
