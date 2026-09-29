// Sends a diagnostic test email using SMTP credentials entered in the Add
// Config dialog — before the config is saved. The DB is never touched (the
// config does not yet exist), so a super admin can verify host/user/password
// work before committing them.

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden } from "@/lib/api-response"
import { isPrivateHost } from "@/lib/host-guard"
import { logger } from "@/lib/logger"
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

  // SSRF guard: this endpoint makes the server open a connection to an
  // operator-supplied host, so internal addresses are off limits.
  if (isPrivateHost(config.host)) {
    return badRequest("That host is not allowed.")
  }

  try {
    const result = await sendTestMail(config, to ?? config.fromEmail)
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    // Log the real SMTP error, but do not echo it: connection failures can
    // leak internal hostnames/addresses back to the caller.
    logger.error("Test mail failed", { err, host: config.host })
    return NextResponse.json(
      { error: "Could not send the test email. Check the server logs." },
      { status: 400 },
    )
  }
})
