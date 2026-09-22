import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { deliveryCity, warehouse } from "@/lib/db/schema"

export async function GET() {
  const me = await requireSession()
  if (!me) return unauthorized()

  const cities = await db
    .select({
      id: deliveryCity.id,
      name: deliveryCity.name,
      warehouseId: deliveryCity.warehouseId,
      warehouseName: warehouse.name,
      zoneId: deliveryCity.zoneId,
    })
    .from(deliveryCity)
    .leftJoin(warehouse, eq(deliveryCity.warehouseId, warehouse.id))
    .where(eq(deliveryCity.isActive, true))
    .orderBy(asc(deliveryCity.name))

  return NextResponse.json(cities)
}
