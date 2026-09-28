import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { dbRead } from "@/lib/db"
import { deliveryCity, warehouse } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const cities = await dbRead
    .select({
      id: deliveryCity.id,
      name: deliveryCity.name,
      warehouseId: deliveryCity.warehouseId,
      zoneId: deliveryCity.zoneId,
    })
    .from(deliveryCity)
    .leftJoin(warehouse, eq(deliveryCity.warehouseId, warehouse.id))
    .where(eq(deliveryCity.isActive, true))
    .orderBy(asc(deliveryCity.name))

  return NextResponse.json(cities)
})
