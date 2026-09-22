import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"
import { SEED_EMAIL_LOGS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedEmailLogs() {
  log("Seeding email logs…")

  for (const entry of SEED_EMAIL_LOGS) {
    const exists = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.id, entry.id))
    if (exists.length > 0) {
      log(`  skip email log to ${entry.to}`)
      continue
    }
    await db.insert(emailLog).values(entry)
    log(`  created email log to ${entry.to} (${entry.status})`)
  }
}
