import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { profile } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Stamps the caller's "last visited the announcements feed" watermark to now.
// Everything published before this moment stops counting as new — the badge
// drains in one write instead of accumulating per-item read receipts
// (announcements are broadcasts; per-item state belongs to R4.1's
// notifications).
//
// Idempotent and monotonic: GREATEST means the watermark only ever moves
// forward, so a stale client can't mark fresh announcements as seen and a
// double-submit changes nothing. Self-service write — not audited.
export const POST = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const now = new Date().toISOString()

  await db
    .update(profile)
    .set({
      announcementsSeenAt: sql`GREATEST(COALESCE(${profile.announcementsSeenAt}, ${now}::timestamptz), ${now}::timestamptz)`,
    })
    .where(eq(profile.userId, me.userId))

  return NextResponse.json({ ok: true, seenAt: now })
})
