import { asc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { dbRead } from "@/lib/db"
import { zonePricing } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const pricing = await dbRead
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
