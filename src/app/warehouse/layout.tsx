import type { Metadata } from "next"
import { AuthProvider } from "@/features/account/hooks/use-auth"
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
      <WarehouseShell>{children}</WarehouseShell>
    </AuthProvider>
  )
}
