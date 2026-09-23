import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { nidSubmitSchema, parseBody } from "@/lib/validation"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id } = await params

  const [current] = await db
    .select({
      id: merchant.id,
      emailVerifiedAt: merchant.emailVerifiedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
    })
    .from(merchant)
    .where(eq(merchant.id, id))
    .limit(1)

  if (!current) return notFound()

  // Only the merchant themselves or an admin can submit NID
  const isOwner = me.role === "MERCHANT" && me.merchantId === current.id
  const isAdmin = me.role === "SUPER_ADMIN"
  if (!isOwner && !isAdmin) {
    return forbidden("You can only submit NID for your own account")
  }

  if (current.nidVerifiedAt) {
    return badRequest("NID is already verified")
  }

  if (!current.emailVerifiedAt) {
    return badRequest("Email must be verified before submitting NID")
  }

  const { data: body, error: bodyError } = await parseBody(req, nidSubmitSchema)
  if (bodyError) return bodyError

  const now = new Date().toISOString()

  const [updated] = await db
    .update(merchant)
    .set({
      nidFrontImage: body.nidFrontImage,
      nidBackImage: body.nidBackImage,
      nidSelfieImage: body.nidSelfieImage,
      nidNumber: body.nidNumber ?? null,
      nidSubmittedAt: now,
      // Clear any previous verification or rejection
      nidVerifiedAt: null,
      nidVerifiedBy: null,
      nidRejectedAt: null,
      nidRejectedBy: null,
      nidRejectionReason: null,
    })
    .where(eq(merchant.id, id))
    .returning()

  return NextResponse.json({
    nidSubmittedAt: updated.nidSubmittedAt,
    nidFrontImage: updated.nidFrontImage,
    nidBackImage: updated.nidBackImage,
    nidSelfieImage: updated.nidSelfieImage,
    nidNumber: updated.nidNumber,
  })
}
