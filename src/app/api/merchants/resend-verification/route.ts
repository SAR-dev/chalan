import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantVerifyEmailTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"
import { parseBody } from "@/lib/validation"

const TOKEN_EXPIRY_HOURS = 24

const resendVerificationSchema = z.object({
  email: z.email("A valid email is required"),
})

// Public endpoint — no session required. Allows unverified merchants to
// request a new activation email from the login page.
export async function POST(req: Request) {
  const parsed = await parseBody(req, resendVerificationSchema)
  if (parsed.error) return parsed.error

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

  const token = createId()
  const expiresAt = new Date(
    Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString()

  await db
    .update(merchant)
    .set({
      emailVerificationToken: token,
      emailVerificationExpiresAt: expiresAt,
    })
    .where(eq(merchant.id, row.id))

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const verificationUrl = `${siteUrl}/api/auth/verify-email?token=${token}`

  const template = await merchantVerifyEmailTemplate({
    ownerName: row.ownerName,
    businessName: row.businessName,
    verificationUrl,
  })

  sendMail(
    {
      to: row.email,
      ...template,
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, err) =>
        console.warn(
          `[mailer] Retry ${attempt} for verification email (${row.email}):`,
          err.message,
        ),
    },
  ).catch((err) =>
    console.error("[mailer] Resend verification email failed:", err),
  )

  return NextResponse.json({ success: true })
}
