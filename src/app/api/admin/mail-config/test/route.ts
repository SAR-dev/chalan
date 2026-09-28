// Sends a diagnostic test email using SMTP credentials entered in the Add
// Config dialog — before the config is saved. The DB is never touched (the
// config does not yet exist), so a super admin can verify host/user/password
// work before committing them.

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { forbidden } from "@/lib/api-response"
import { sendTestMail } from "@/lib/mailer"
import { parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const testMailSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  secure: z.boolean(),
  user: z.string().min(1, "User is required"),
  pass: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid email"),
  fromName: z.string().min(1, "From name is required"),
  // Defaults to fromEmail; lets a caller route the test to any address.
  to: z.string().email("Invalid email").optional(),
})

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me || me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, testMailSchema)
  if (parsed.error) return parsed.error

  const { to, ...config } = parsed.data
  try {
    const result = await sendTestMail(config, to ?? config.fromEmail)
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Surface the SMTP error verbatim (e.g. nodemailer's "Invalid login: 535
    // 5.7.8 Username and Password not accepted") so the admin can correct it.
    return NextResponse.json(
      { error: message || "Failed to send test email." },
      { status: 400 },
    )
  }
})
