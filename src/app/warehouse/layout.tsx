import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { getAppVersion } from "@/lib/version"
import { WarehouseShell } from "./warehouse-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function WarehouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <WarehouseShell version={getAppVersion()}>{children}</WarehouseShell>
    </AuthProvider>
  )
}
