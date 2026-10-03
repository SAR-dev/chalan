"use client"

import { Loader2 } from "lucide-react"
import { TopNav } from "@/components/navigation/top-nav"
import { useAuth } from "@/features/account/hooks/use-auth"
import { navConfigForUser } from "@/lib/nav-config"

/**
 * TopNav + children for the shared announcement page. The account subtitle
 * (warehouse name / rider zone / business name) is only known to the role
 * shells, which fetch their own resource hooks — here the RightNav panel
 * falls back to the account email, which is what the sidebar footer showed
 * when no subtitle was passed.
 */
export function AnnouncementsChrome({
  children,
}: {
  children: React.ReactNode
}) {
  const { currentUser, isReady } = useAuth()

  if (!isReady || !currentUser) {
    return (
      <div
        role="status"
        className="bg-background flex min-h-screen items-center justify-center"
      >
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <TopNav config={navConfigForUser(currentUser)} />
      {children}
    </div>
  )
}
