import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { getAppVersion } from "@/lib/version"
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
      <RiderShell version={getAppVersion()}>{children}</RiderShell>
    </AuthProvider>
  )
}
