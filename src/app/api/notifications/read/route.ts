import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { markNotificationsRead } from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// Mark notifications read — the caller's own rows only.
//
// Replaces the old `POST /api/notifications/seen`, which stamped one watermark
// on the profile and so could only ever say "everything before this instant".
// That made a per-row state impossible: anything arriving while the inbox was
// open was swept into the same stamp, and one row could not be marked without
// marking the rest.
//
// Body: `{ ids?: string[], all?: boolean }`. Omitting `ids` with `all` true
// marks everything unread and unarchived. Idempotent — `readAt` is only written
// where it is still null, so a double-submit cannot move the timestamp.
//
// Self-service, not audited: it is the reader's own inbox state, and auditing
// it would write a row per notification read.

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT") return forbidden()

  let ids: string[] | undefined
  let all = false
  try {
    const body = (await req.json()) as {
      ids?: unknown
      all?: unknown
    }
    ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : undefined
    all = body.all === true
  } catch {
    // An empty body is a valid "mark everything" request, not an error.
  }

  if (!all && (!ids || ids.length === 0)) {
    return NextResponse.json(
      { error: "Provide `ids` to mark, or `all: true`." },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const marked = await markNotificationsRead(db, {
    userId: me.userId,
    ids: all ? undefined : ids,
    now,
  })

  return NextResponse.json({ ok: true, marked, readAt: now })
})
