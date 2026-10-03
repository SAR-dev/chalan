import { AuthProvider } from "@/features/account/hooks/use-auth"
import { AnnouncementsChrome } from "./chrome"

// Shared wrapper for /announcements/[id]. The route sits outside the four
// role segments (one URL per announcement for every role), so it brings its
// own AuthProvider + TopNav — the same chrome a signed-in reader arrives
// with, without duplicating a role shell.
export default function AnnouncementsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <AnnouncementsChrome>{children}</AnnouncementsChrome>
    </AuthProvider>
  )
}
