import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { dbRead } from "@/lib/db"
import { deliveryZone } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const zones = await dbRead
    .select({ id: deliveryZone.id, name: deliveryZone.name })
    .from(deliveryZone)
    .where(eq(deliveryZone.isActive, true))
    .orderBy(asc(deliveryZone.name))

  return NextResponse.json(zones)
})
