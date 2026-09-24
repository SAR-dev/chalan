import { asc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (

) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const pricing = await db
    .select({
      id: zonePricing.id,
      fromZoneId: zonePricing.fromZoneId,
      toZoneId: zonePricing.toZoneId,
      baseRate: zonePricing.baseRate,
      extraRatePerKg: zonePricing.extraRatePerKg,
      freeWeightKg: zonePricing.freeWeightKg,
      maxWeightKg: zonePricing.maxWeightKg,
      codFeePercentage: zonePricing.codFeePercentage,
    })
    .from(zonePricing)
    .orderBy(asc(zonePricing.fromZoneId), asc(zonePricing.toZoneId))

  return NextResponse.json(pricing)
})

