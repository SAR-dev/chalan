import { db } from "@/lib/db"
import { platformConfig } from "@/lib/db/schema"
import { log } from "./helpers"

export async function seedPlatformConfig() {
  const existing = await db
    .select()
    .from(platformConfig)
    .limit(1)
    .then((r) => r[0])

  if (existing) {
    log("Platform config already exists — skipping")
    return
  }

  await db.insert(platformConfig).values({
    id: "default",
    minCodFeePercentage: 0.5,
    maxCodFeePercentage: 5,
  })

  log("Seeded platform config")
}
