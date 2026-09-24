import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { nidReviewSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({
        id: merchant.id,
        businessName: merchant.businessName,
        nidSubmittedAt: merchant.nidSubmittedAt,
        nidVerifiedAt: merchant.nidVerifiedAt,
        nidRejectedAt: merchant.nidRejectedAt,
      })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()
    if (!current.nidSubmittedAt) {
      return badRequest("Merchant has not submitted NID yet")
    }
    if (current.nidVerifiedAt) {
      return badRequest("NID is already verified")
    }
    if (current.nidRejectedAt) {
      return badRequest("NID has already been rejected")
    }

    const { data: body, error: bodyError } = await parseBody(
      req,
      nidReviewSchema,
    )
    if (bodyError) return bodyError

    if (body.action === "reject" && !body.reason) {
      return badRequest("Rejection reason is required")
    }

    const now = new Date().toISOString()

    const [updated] = await db
      .update(merchant)
      .set(
        body.action === "approve"
          ? {
              nidVerifiedAt: now,
              nidVerifiedBy: me.name,
            }
          : {
              nidRejectedAt: now,
              nidRejectedBy: me.name,
              nidRejectionReason: body.reason,
            },
      )
      .where(eq(merchant.id, id))
      .returning()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action:
        body.action === "approve"
          ? "MERCHANT_NID_VERIFIED"
          : "MERCHANT_NID_REJECTED",
      entityType: "merchant",
      entityId: updated.id,
      description:
        body.action === "approve"
          ? `Verified NID for merchant ${current.businessName}`
          : `Rejected NID for merchant ${current.businessName}: ${body.reason}`,
    })

    return NextResponse.json({
      nidVerifiedAt: updated.nidVerifiedAt,
      nidVerifiedBy: updated.nidVerifiedBy,
      nidRejectedAt: updated.nidRejectedAt,
      nidRejectedBy: updated.nidRejectedBy,
      nidRejectionReason: updated.nidRejectionReason,
    })
  },
)
