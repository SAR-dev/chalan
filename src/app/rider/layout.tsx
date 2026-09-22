import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { RiderShell } from "./rider-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function RiderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <RiderShell>{children}</RiderShell>
    </AuthProvider>
  )
}
