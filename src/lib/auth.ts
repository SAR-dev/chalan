import { betterAuth } from "better-auth"
import { admin, twoFactor } from "better-auth/plugins"
import { siteConfig } from "@/config/site"
import { pool } from "@/lib/db"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import {
  changeEmailTemplate,
  passwordResetTemplate,
} from "@/lib/mail-templates"

const baseURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

function parseAllowedUrls(): string[] {
  const raw = process.env.BETTER_AUTH_ALLOWED_URLS
  if (!raw) return []
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
}

export async function handlePasswordReset({
  user,
  url,
}: {
  user: { name: string; email: string }
  url: string
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const resetUrl = url.startsWith("http") ? url : `${siteUrl}${url}`
  const template = await passwordResetTemplate({
    userName: user.name,
    resetUrl,
  })
  // Persist then attempt delivery (ROADMAP P1.5): the row survives a frozen
  // invocation and is retried by the outbox cron. A failure here must not fail
  // the auth flow (same posture as the old fire-and-forget send).
  try {
    await enqueueEmail({ to: user.email, ...template })
    void flushEmailOutbox()
  } catch (err) {
    console.error("[email-outbox] Password reset enqueue failed:", err)
  }
}

// ROADMAP 5.3 — Better Auth's change-email flow calls this with the NEW
// address already merged into `user.email`, so the confirmation link is
// delivered to the address being switched to (the old one keeps working
// until the link is clicked). Fire-and-forget like handlePasswordReset —
// MAIL_DISABLED and missing SMTP config only log, they never fail the request.
export async function handleEmailChangeVerification({
  user,
  url,
}: {
  user: { name: string; email: string }
  url: string
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const verifyUrl = url.startsWith("http") ? url : `${siteUrl}${url}`
  const template = await changeEmailTemplate({
    userName: user.name,
    newEmail: user.email,
    verifyUrl,
  })
  try {
    await enqueueEmail({ to: user.email, ...template })
    void flushEmailOutbox()
  } catch (err) {
    console.error("[email-outbox] Change email enqueue failed:", err)
  }
}

export const auth = betterAuth({
  // twoFactor(): TOTP + recovery codes for admin roles (ROADMAP H4). Enrollment
  // is opt-in; enforcement is a separate platform-config toggle (default OFF).
  plugins: [admin(), twoFactor({ issuer: siteConfig.name })],
  baseURL,
  emailAndPassword: {
    enabled: true,
    // Public self-signup is closed (ROADMAP P0.7): every account in this system
    // is created server-side (merchant application, admin/owner invites) and
    // gets a profile row in the same flow. Leaving `disableSignUp` unset meant
    // `POST /api/auth/sign-up/email` happily created a password-only user with
    // no profile — a session that passed `isActive` but belonged to no portal.
    disableSignUp: true,
    autoSignIn: true,
    sendResetPassword: handlePasswordReset,
  },
  // ROADMAP 5.3 — change your own login email. `changeEmail.enabled` turns on
  // POST /change-email (session-only, no password re-entry required); the
  // one-time confirmation link goes to the NEW address via
  // emailVerification.sendVerificationEmail. Better Auth's optional two-step
  // `sendChangeEmailConfirmation` (confirm to the old inbox first) is left
  // off on purpose — one click, delivered straight to the new inbox.
  user: {
    changeEmail: { enabled: true },
  },
  emailVerification: {
    sendVerificationEmail: handleEmailChangeVerification,
  },
  trustedOrigins: [
    baseURL,
    ...(process.env.NEXT_PUBLIC_SITE_URL
      ? [process.env.NEXT_PUBLIC_SITE_URL]
      : []),
    ...parseAllowedUrls(),
  ],
  rateLimit: {
    enabled: process.env.AUTH_RATE_LIMIT_DISABLED !== "1",
    window: 60,
    max: process.env.NODE_ENV === "production" ? 10 : 100,
    customRules: {
      // Sign-in was capped at 100/min, which is no limit at all next to the
      // global 10 — credential stuffing had a 10x budget. Keep a generous
      // development value so local testing is not throttled, and match the
      // global production cap in production (ROADMAP P0.6).
      "/sign-in/*": {
        window: 60,
        max: process.env.NODE_ENV === "production" ? 10 : 100,
      },
      // get-session is polled by every page load / SWR bootstrap — keep it
      // under its own generous cap so it never starves real users inside the
      // tighter global production limit.
      "/get-session": { window: 60, max: 60 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24,
    },
  },
  database: pool,
})
