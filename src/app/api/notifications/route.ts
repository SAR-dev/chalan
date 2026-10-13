import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import {
  countUnreadNotifications,
  getNotificationsForUser,
} from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// The caller's own notification inbox.
//
// Strictly the caller's rows: the query filters on the session's userId and
// nothing else is accepted as input, so there is no way to ask for someone
// else's. `limit` is clamped because the tray renders a fixed-height list — an
// unbounded inbox would be a cheap way for one account to pull the whole table.
//
// `?count=1` returns only the unread badge number, counted from `readAt`. It is a separate shape rather
// than a flag on the list response so the badge poll stays a small row-count
// query instead of dragging 50 rows across the network every few seconds.

const MAX_LIMIT = 100

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  // Only roles that actually receive notifications. A rider has no merchant, so
  // their inbox would always be empty — better to say so than to render a bell
  // that can never light up.
  if (me.role !== "MERCHANT") return forbidden()

  const url = new URL(req.url)
  const countOnly = url.searchParams.get("count") === "1"

  if (countOnly) {
    const newCount = await countUnreadNotifications(dbRead, {
      userId: me.userId,
    })
    return NextResponse.json({ newCount })
  }

  const raw = Number(url.searchParams.get("limit"))
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : 50

  const result = await getNotificationsForUser(dbRead, {
    userId: me.userId,
    limit,
  })

  return NextResponse.json(result)
})
