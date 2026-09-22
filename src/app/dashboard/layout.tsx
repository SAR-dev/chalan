import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { DashboardShell } from "./dashboard-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  )
}
