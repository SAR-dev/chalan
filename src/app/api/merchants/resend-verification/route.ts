import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { merchantVerifyEmailTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, resendVerificationSchema } from "@/lib/validation"
import { issueVerifyToken, verifyTokenUrl } from "@/lib/verify-token"
import { withErrorHandler } from "@/lib/with-error-handler"

// Public endpoint — no session required. Allows unverified merchants to
// request a new activation email from the login page.
export const POST = withErrorHandler(async (req: Request) => {
  const parsed = await parseBody(req, resendVerificationSchema)
  if (parsed.error) return parsed.error

  // Public relay into the SMTP queue — tight per-IP budget and a 5 min window
  // so it cannot be abused to flood a mailbox or spam the mailer.
  const limited = await rateLimitByIp(req, "resend-verification", 3, 300, {
    failClosed: true,
  })
  if (limited) return limited

  const { email } = parsed.data

  const [row] = await db
    .select({
      id: merchant.id,
      email: merchant.email,
      ownerName: merchant.ownerName,
      businessName: merchant.businessName,
      emailVerifiedAt: merchant.emailVerifiedAt,
    })
    .from(merchant)
    .where(eq(merchant.email, email))
    .limit(1)

  // Always return success to prevent email enumeration
  if (!row || row.emailVerifiedAt) {
    return NextResponse.json({ success: true })
  }

  // Only the hash is stored (ROADMAP P0.7); the raw token lives in the email.
  const { raw: token, hash, expiresAt } = issueVerifyToken()

  await db
    .update(merchant)
    .set({
      emailVerificationToken: hash,
      emailVerificationExpiresAt: expiresAt,
    })
    .where(eq(merchant.id, row.id))

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const verificationUrl = verifyTokenUrl(token, siteUrl)

  const template = await merchantVerifyEmailTemplate({
    ownerName: row.ownerName,
    businessName: row.businessName,
    verificationUrl,
  })

  sendMail({
    to: row.email,
    ...template,
  }).catch((err) => logger.error("Resend verification email failed", { err }))

  return NextResponse.json({ success: true })
})
