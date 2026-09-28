// Server component: renders a slim top strip warning that this is a demo
// server whose database is wiped and re-seeded at midnight. Reads the
// NEXT_DEVELOPMENT_MODE flag server-side so it never reaches the client bundle
// when off.

import { isDevModeEnabled } from "@/lib/dev-mode"

export function DevModeBanner() {
  if (!isDevModeEnabled()) return null

  return (
    <div
      data-testid="dev-mode-banner"
      role="note"
      className="border-b bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-200"
    >
      Demo server — the database is reset to seeded data at 12:00 AM every day.
    </div>
  )
}
