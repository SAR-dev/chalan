import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { setNotificationArchived } from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// Dismiss or restore one of the caller's notifications.
//
// Deliberately separate from reading: archiving is a stronger statement — "stop
// showing me this" — and collapsing the two would make an archived row and a
// read row indistinguishable once the inbox was filtered.
//
// Body: `{ archived: boolean }`. Omitting it archives. Restoring clears
// `archivedAt` and nothing else, so a row comes back exactly as it was.
//
// Self-service, not audited.

interface Props {
  params: Promise<{ id: string }>
}

export const PATCH = withErrorHandler(
  async (req: Request, { params }: Props) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "MERCHANT") return forbidden()

    const { id } = await params

    let archived = true
    try {
      const body = (await req.json()) as { archived?: unknown }
      if (typeof body.archived === "boolean") archived = body.archived
    } catch {
      // An empty body archives, matching the toggle's common case.
    }

    const now = new Date().toISOString()
    const ok = await setNotificationArchived(db, {
      userId: me.userId,
      id,
      archived,
      now,
    })

    if (!ok) return notFound("Notification not found")
    return NextResponse.json({ ok: true, archived })
  },
)
