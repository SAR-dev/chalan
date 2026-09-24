import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { deliveryZone } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (

) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const zones = await db
    .select({ id: deliveryZone.id, name: deliveryZone.name })
    .from(deliveryZone)
    .where(eq(deliveryZone.isActive, true))
    .orderBy(asc(deliveryZone.name))

  return NextResponse.json(zones)
})

