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

  // A dropdown source that changes rarely — cached briefly so repeat
  // navigation does not re-query (ROADMAP R3.11).
  return NextResponse.json(cities, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  })
})
