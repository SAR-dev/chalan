import { NextResponse } from "next/server"
import { getActiveAnnouncements } from "@/lib/announcements"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { withErrorHandler } from "@/lib/with-error-handler"

// Returns announcements that are currently live for the caller's role, each
// carrying `readAt` (null = unread). "Live" and role targeting are defined
// once in src/lib/announcements.ts so this list can never disagree with the
// detail page or the inbox.
//
// Bounded by MAX_ACTIVE_ANNOUNCEMENTS rather than paginated — active
// announcements are small in number, but the query must still be bounded.
// Read/unread state is server-side (`announcement_read`), so it follows the
// account across devices.
const MAX_ACTIVE_ANNOUNCEMENTS = 50

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const rows = await getActiveAnnouncements(dbRead, {
    userId: me.userId,
    role: me.role,
    limit: MAX_ACTIVE_ANNOUNCEMENTS,
  })

  return NextResponse.json(rows)
})
