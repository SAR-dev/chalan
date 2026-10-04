// Sends a diagnostic test email using SMTP credentials entered in the Add
// Config dialog — before the config is saved. The DB is never touched (the
// config does not yet exist), so a super admin can verify host/user/password
// work before committing them.

import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden } from "@/lib/api-response"
import { isPrivateHost } from "@/lib/host-guard"
import { logger } from "@/lib/logger"
import { sendTestMail } from "@/lib/mailer"
import { parseBody, testMailSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

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
    logger.error("Test mail failed", { err, host: config.host })

    // Split by where the failure happened (CONTRIBUTING §6):
    //  - The remote server's OWN response (535 "Username and Password not
    //    accepted", 530 "Must issue a STARTTLS command" …) is safe to return
    //    and is exactly what the admin needs to correct the form. Its words,
    //    not ours — nothing internal is in it.
    //  - Connection/DNS/timeout failures are NOT: their message embeds our
    //    side's host:port and resolved addresses, so those keep the generic
    //    text (pinned by mail-config.spec.ts) and the detail stays in the
    //    server log.
    const responseCode = (err as { responseCode?: unknown }).responseCode
    if (typeof responseCode === "number" && err instanceof Error) {
      // Collapse the multi-line SMTP response (Gmail appends "Learn more at"
      // URLs on their own lines) and cap it so a hostile server can't flood
      // the toast.
      const detail = err.message.replace(/\s+/g, " ").slice(0, 300)
      return NextResponse.json({ error: detail }, { status: 400 })
    }
    return NextResponse.json(
      { error: "Could not send the test email. Check the server logs." },
      { status: 400 },
    )
  }
})
