import { asc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { deliveryCity } from "@/lib/db/schema"
import { deliveryCityCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "WAREHOUSE_ADMIN") {
    return forbidden()
  }

  const cities = await dbRead
    .select()
    .from(deliveryCity)
    .orderBy(asc(deliveryCity.name))

  return NextResponse.json(cities)
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, deliveryCityCreateSchema)
  if (parsed.error) return parsed.error

  const [created] = await db
    .insert(deliveryCity)
    .values({
      name: parsed.data.name.trim(),
      warehouseId: parsed.data.warehouseId,
      zoneId: parsed.data.zoneId,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
})
