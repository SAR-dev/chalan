import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { SEED_AUDIT_LOGS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedAuditLogs() {
  log("Seeding audit logs…")

  for (const entry of SEED_AUDIT_LOGS) {
    const exists = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, entry.id))
    if (exists.length > 0) {
      log(`  skip audit log ${entry.action}`)
      continue
    }
    await db.insert(auditLog).values(entry)
    log(`  created audit log ${entry.action}`)
  }
}
