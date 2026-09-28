// Schedules the demo database reset for NEXT_DEVELOPMENT_MODE.
//
// When dev mode is on, the database is wiped and re-seeded with the basic seed
// (src/lib/db/seed/basic.ts) at 12:00 AM local time every day. The server's
// clock is pinned by TZ (Asia/Dhaka by default, see .env.example), so
// "12:00 AM" is in the app's business timezone.
//
// Scheduling starts once from instrumentation.ts when the NEXT.js dev/server
// process boots and re-arms itself after each run. Single-instance only: the
// dev/demo box is expected to run one server, so no distributed lock is used.
// A failed reset is logged and the next midnight is still scheduled.

import { logger } from "@/lib/logger"

let armed = false
let running = false

function scheduleNext(): void {
  const now = new Date()
  const nextMidnight = new Date(now)
  // JS normalises 24:00 to 00:00 of the next day. Uses server-local time,
  // which TZ pins to the business timezone.
  nextMidnight.setHours(24, 0, 0, 0)
  const delay = Math.max(nextMidnight.getTime() - now.getTime(), 1_000)

  setTimeout(() => {
    void runReset()
  }, delay)
}

async function runReset(): Promise<void> {
  if (running) return
  running = true
  try {
    logger.info("Demo mode: resetting database with the basic seed")
    const { seedBasicDatabase } = await import("@/lib/db/seed/basic")
    await seedBasicDatabase()
    logger.info("Demo mode: database reset complete")
  } catch (err) {
    logger.error("Demo mode: database reset failed", { err })
  } finally {
    running = false
    scheduleNext()
  }
}

/** Arm the daily reset for the lifetime of the server process. */
export function scheduleDemoReset(): void {
  if (armed) return
  armed = true
  scheduleNext()
}
