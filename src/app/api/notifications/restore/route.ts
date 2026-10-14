import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { restoreNotifications } from "@/lib/notifications"
import { withErrorHandler } from "@/lib/with-error-handler"

// Put a set of dismissed notifications back.
//
// Exists for the undo affordance: archiving is reversible now, and a dismissal
// that cannot be taken back is a deletion wearing a softer name. Bulk rather
// than per-id because the undo fires from a toast that expires in five seconds —
// walking back sixty rows one request at a time is how that ends up restoring
// half of them.
//
// Body: `{ ids: string[] }`. Scoped to the caller's own rows inside the query,
// so a crafted id cannot reach another account's notifications.

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "MERCHANT") return forbidden()

  let ids: string[] = []
  try {
    const body = (await req.json()) as { ids?: unknown }
    if (Array.isArray(body.ids))
      ids = body.ids.filter((v): v is string => typeof v === "string")
  } catch {
    // No body: nothing to restore, which is a no-op rather than an error — the
    // toast's undo can fire after the component that owned the ids unmounted.
  }

  const restored = await restoreNotifications(db, { userId: me.userId, ids })

  return NextResponse.json({ ok: true, restored })
})
