import { asc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { deliveryZone } from "@/lib/db/schema"
import { deliveryZoneCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (

) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "WAREHOUSE_ADMIN") {
    return forbidden()
  }

  const zones = await db
    .select()
    .from(deliveryZone)
    .orderBy(asc(deliveryZone.name))

  return NextResponse.json(zones)
})


export const POST = withErrorHandler(async (
req: Request
) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, deliveryZoneCreateSchema)
  if (parsed.error) return parsed.error

  const [created] = await db
    .insert(deliveryZone)
    .values({ name: parsed.data.name.trim() })
    .returning()

  return NextResponse.json(created, { status: 201 })
})

