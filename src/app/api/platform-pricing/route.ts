// Public platform-default pricing, used by the merchant order form's live quote
// as the fallback when a city pair has no zone-pricing row. No PII, no session.

import { NextResponse } from "next/server"
import { dbRead } from "@/lib/db"
import { platformConfig } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

const FALLBACK = {
  baseRate: 0,
  extraRatePerKg: 0,
  freeWeightKg: 1,
  maxWeightKg: 3,
  codFeePercentage: 1,
  cancellationFee: 0,
}

export const GET = withErrorHandler(async () => {
  const [config] = await dbRead
    .select({
      baseRate: platformConfig.defaultBaseRate,
      extraRatePerKg: platformConfig.defaultExtraRatePerKg,
      freeWeightKg: platformConfig.defaultFreeWeightKg,
      maxWeightKg: platformConfig.defaultMaxWeightKg,
      codFeePercentage: platformConfig.defaultCodFeePercentage,
      cancellationFee: platformConfig.defaultCancellationFee,
    })
    .from(platformConfig)
    .limit(1)

  return NextResponse.json(config ?? FALLBACK)
})
