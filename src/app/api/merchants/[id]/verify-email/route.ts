import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantVerifyEmailTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import { issueVerifyToken, verifyTokenUrl } from "@/lib/verify-token"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    const [current] = await db
      .select({
        id: merchant.id,
        status: merchant.status,
        email: merchant.email,
        ownerName: merchant.ownerName,
        businessName: merchant.businessName,
        emailVerifiedAt: merchant.emailVerifiedAt,
      })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()

    // Only the merchant themselves or an admin can trigger verification
    const isOwner = me.role === "MERCHANT" && me.merchantId === current.id
    const isAdmin = me.role === "SUPER_ADMIN"
    if (!isOwner && !isAdmin) {
      return badRequest("You can only verify your own email")
    }

    if (current.emailVerifiedAt) {
      return badRequest("Email is already verified")
    }

    // Only the hash is stored (ROADMAP P0.7); the raw token lives in the email.
    const { raw: token, hash, expiresAt } = issueVerifyToken()

    await db
      .update(merchant)
      .set({
        emailVerificationToken: hash,
        emailVerificationExpiresAt: expiresAt,
      })
      .where(eq(merchant.id, id))

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    const verificationUrl = verifyTokenUrl(token, siteUrl)

    const template = await merchantVerifyEmailTemplate({
      ownerName: current.ownerName,
      businessName: current.businessName,
      verificationUrl,
    })

    sendMail(
      {
        to: current.email,
        ...template,
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, err) =>
          console.warn(
            `[mailer] Retry ${attempt} for verification email (${current.email}):`,
            err.message,
          ),
      },
    ).catch((err) => console.error("[mailer] Verification email failed:", err))

    return NextResponse.json({ success: true })
  },
)
