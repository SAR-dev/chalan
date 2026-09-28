import { encryptSecret } from "@/lib/crypto"
import { db } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"
import { log } from "./helpers"

/**
 * E2E fixture (opt-in via `SEED_MAIL_CONFIG=1`, set by the Playwright
 * webServer): inserts an ACTIVE SMTP config so routes that gate on
 * `hasActiveMailConfig()` (resend-activation, verify-email) are reachable.
 *
 * It never overwrites an existing config, and the host is unreachable, so
 * sends still fail — which is exactly what the activation/email specs rely on
 * (they read links out of `email_log` FAILED rows).
 */
export async function seedMailConfig() {
  if (process.env.SEED_MAIL_CONFIG !== "1") return

  const existing = await db
    .select({ id: mailConfig.id })
    .from(mailConfig)
    .limit(1)
  if (existing.length > 0) {
    log("  mail config already exists, skipping")
    return
  }

  await db.insert(mailConfig).values({
    label: "E2E (unreachable SMTP)",
    host: "127.0.0.1",
    port: "1",
    secure: false,
    user: "e2e",
    pass: encryptSecret("e2e-password"),
    fromEmail: "no-reply@e2e.local",
    fromName: "E2E",
    isActive: true,
  })
  log("  created E2E mail config")
}
