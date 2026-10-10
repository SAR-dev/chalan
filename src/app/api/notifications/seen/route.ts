import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { markNotificationsSeen } from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// Stamps the caller's "last opened the inbox" watermark to now, draining the
// badge in one write instead of tracking a read receipt per notification.
//
// Monotonic by construction (`GREATEST`, in `markNotificationsSeen`), so a stale
// client cannot re-badge rows it has already seen and a double-submit is a
// no-op. Self-service write — not audited.

export const POST = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT") return forbidden()

  const now = new Date().toISOString()
  await markNotificationsSeen(db, { userId: me.userId, now })

  return NextResponse.json({ ok: true, seenAt: now })
})
