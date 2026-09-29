import { desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import {
  merchant,
  packagePurchaseRequest,
  pricingPackage,
} from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

/** Review queue for package purchase requests (SUPER_ADMIN). */
export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const rows = await dbRead
    .select({
      id: packagePurchaseRequest.id,
      merchantId: packagePurchaseRequest.merchantId,
      merchantName: merchant.businessName,
      packageId: packagePurchaseRequest.packageId,
      packageName: pricingPackage.name,
      amount: packagePurchaseRequest.amount,
      status: packagePurchaseRequest.status,
      note: packagePurchaseRequest.note,
      requestedAt: packagePurchaseRequest.requestedAt,
      reviewedBy: packagePurchaseRequest.reviewedBy,
      reviewedAt: packagePurchaseRequest.reviewedAt,
      rejectReason: packagePurchaseRequest.rejectReason,
    })
    .from(packagePurchaseRequest)
    .innerJoin(merchant, eq(merchant.id, packagePurchaseRequest.merchantId))
    .innerJoin(
      pricingPackage,
      eq(pricingPackage.id, packagePurchaseRequest.packageId),
    )
    .orderBy(
      // Pending first, then newest. Plain `asc(status)` would sort APPROVED
      // ahead of PENDING alphabetically, burying the work the admin came for.
      sql`CASE ${packagePurchaseRequest.status} WHEN 'PENDING' THEN 0 ELSE 1 END`,
      desc(packagePurchaseRequest.requestedAt),
    )

  return NextResponse.json(rows)
})
