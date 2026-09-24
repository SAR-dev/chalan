import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { merchant, user } from "@/lib/db/schema"
import { merchantWelcomeTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import { withErrorHandler } from "@/lib/with-error-handler"

// Public endpoint — no session required. The verification link from the email
// hits this endpoint, which verifies the token and marks the merchant's email
// as verified. Redirects to the login page with a success/error query param.
export const GET = withErrorHandler(async (
req: Request
) => {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing-token", req.url))
  }

  const now = new Date().toISOString()

  const [current] = await db
    .select({
      id: merchant.id,
      emailVerifiedAt: merchant.emailVerifiedAt,
      emailVerificationExpiresAt: merchant.emailVerificationExpiresAt,
    })
    .from(merchant)
    .where(eq(merchant.emailVerificationToken, token))
    .limit(1)

  if (!current) {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url))
  }

  if (current.emailVerifiedAt) {
    return NextResponse.redirect(
      new URL("/login?error=already-verified", req.url),
    )
  }

  if (
    current.emailVerificationExpiresAt &&
    current.emailVerificationExpiresAt < now
  ) {
    return NextResponse.redirect(new URL("/login?error=token-expired", req.url))
  }

  const [_updated] = await db
    .update(merchant)
    .set({
      emailVerifiedAt: now,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      status: "ACTIVE",
      approvedAt: now,
      approvedBy: "System",
    })
    .where(eq(merchant.id, current.id))
    .returning()

  // Also mark the Better Auth user row as email-verified so that
  // auth.api.getSession() does not treat the session as unverified.
  if (_updated) {
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, _updated.email))

    // Send welcome email (fire-and-forget)
    const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/welcome`
    sendMail({
      to: _updated.email,
      ...(await merchantWelcomeTemplate({
        ownerName: _updated.ownerName,
        businessName: _updated.businessName,
        dashboardUrl,
      })),
    }).catch((err) => console.error("[mailer] Welcome email failed:", err))
  }

  return NextResponse.redirect(
    new URL("/login?success=email-verified&activated=1", req.url),
  )
})

