import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { platformConfig } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Rider- and warehouse-facing read path for the R9 scan toggles.
 *
 * `/api/platform-config` is SUPER_ADMIN-only and sits in the proxy's
 * ADMIN_API_PREFIXES IP allowlist, so neither riders nor warehouse admins can
 * reach it — the four booleans get their own route behind plain
 * `requireSession()` (any signed-in role). Unresolved defaults matter too:
 * while this is in flight the reader treats all four toggles as required
 * (`?? true`), matching the DB default.
 */
export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const config = await dbRead
    .select({
      pickupScanRequired: platformConfig.pickupScanRequired,
      deliveryScanRequired: platformConfig.deliveryScanRequired,
      warehouseScanRequired: platformConfig.warehouseScanRequired,
      warehouseReceiveScanRequired: platformConfig.warehouseReceiveScanRequired,
    })
    .from(platformConfig)
    .limit(1)
    .then((r) => r[0])

  // No row yet → the DB defaults (all on) are what a fresh insert would write.
  return NextResponse.json({
    pickupScanRequired: config?.pickupScanRequired ?? true,
    deliveryScanRequired: config?.deliveryScanRequired ?? true,
    warehouseScanRequired: config?.warehouseScanRequired ?? true,
    warehouseReceiveScanRequired: config?.warehouseReceiveScanRequired ?? true,
  })
})
