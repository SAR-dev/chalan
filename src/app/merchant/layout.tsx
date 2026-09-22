import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { MerchantShell } from "./merchant-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function MerchantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <MerchantShell>{children}</MerchantShell>
    </AuthProvider>
  )
}
