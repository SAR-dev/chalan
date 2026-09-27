import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { merchant, user } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { merchantWelcomeTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import { hashVerifyToken } from "@/lib/verify-token"
import { withErrorHandler } from "@/lib/with-error-handler"

// Public endpoint — no session required. The verification link from the email
// hits this endpoint, which verifies the token and marks the merchant's email
// as verified. Redirects to the login page with a success/error query param.
export const GET = withErrorHandler(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing-token", req.url))
  }

  // Better Auth's change-email confirmation link (ROADMAP 5.3) resolves to
  // this same path: Next.js routes a static segment ahead of the
  // /api/auth/[...all] catch-all. Those tokens are stateless HS256 JWTs (they
  // contain dots), never a merchant cuid — hand them to Better Auth's own
  // handler, which flips `user.email` and redirects back.
  if (token.includes(".")) {
    return auth.handler(req)
  }

  const now = new Date().toISOString()

  // The table holds only the SHA-256 hash of the token (ROADMAP P0.7) — the
  // raw value exists solely inside the emailed link.
  const [current] = await db
    .select({
      id: merchant.id,
      emailVerifiedAt: merchant.emailVerifiedAt,
      emailVerificationExpiresAt: merchant.emailVerificationExpiresAt,
    })
    .from(merchant)
    .where(eq(merchant.emailVerificationToken, hashVerifyToken(token)))
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
    }).catch((err) => logger.error("Welcome email failed", { err }))
  }

  return NextResponse.redirect(
    new URL("/login?success=email-verified&activated=1", req.url),
  )
})
