import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { SEED_ANNOUNCEMENTS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedAnnouncements() {
  log("Seeding announcements…")

  for (const entry of SEED_ANNOUNCEMENTS) {
    const exists = await db
      .select()
      .from(announcement)
      .where(eq(announcement.id, entry.id))
    if (exists.length > 0) {
      log(`  skip announcement "${entry.title}"`)
      continue
    }
    await db.insert(announcement).values(entry)
    log(`  created announcement "${entry.title}"`)
  }
}
