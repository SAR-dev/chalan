import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { archiveReadNotifications } from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// Dismiss everything the reader has already read, in one go.
//
// The button you press once a backlog is done. Only read rows are eligible — the
// guard lives in the WHERE clause in `archiveReadNotifications` rather than here,
// so no caller can get it wrong and drop parcels the reader had not looked at.
//
// Returns the ids it touched so the UI can offer an undo that names exactly what
// came back, rather than a blanket "restore" that would also resurrect rows
// dismissed deliberately a week ago.
//
// Self-service, not audited — same posture as the per-row archive route.

export const POST = withErrorHandler(async (_req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT") return forbidden()

  const ids = await archiveReadNotifications(db, {
    userId: me.userId,
    now: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, archived: ids.length, ids })
})
