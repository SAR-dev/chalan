// Mail-config availability check shared by the mail-triggering routes.
//
// Explicit "send this email now" actions (resend activation, verify-email)
// reach the frontend synchronously, so when no SMTP config exists we can give
// the user a real error instead of silently enqueueing a mail that can never
// be delivered. Business state transitions (merchant approval etc.) do NOT
// check this — the outbox records the FAILED attempt in email_log and the
// state change still commits.

import { eq } from "drizzle-orm"
import { dbRead } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"

export const MAIL_NOT_CONFIGURED_MESSAGE =
  "Mail server is not set up yet. The admin needs to add an SMTP configuration before emails can be sent."

/** True when at least one active SMTP config exists. Never throws. */
export async function hasActiveMailConfig(): Promise<boolean> {
  try {
    const [row] = await dbRead
      .select({ id: mailConfig.id })
      .from(mailConfig)
      .where(eq(mailConfig.isActive, true))
      .limit(1)
    return Boolean(row)
  } catch {
    // Table may not exist yet during migrations — treat as "not configured".
    return false
  }
}
