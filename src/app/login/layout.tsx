import type { Metadata } from "next"
import { ReactNode } from "react"
import { siteConfig } from "@/config/site"
import { AuthProvider } from "@/features/account/hooks/use-auth"

export const metadata: Metadata = {
  title: "Sign In",
  description: `Sign in to your ${siteConfig.name} account to manage deliveries, track parcels, and access your dashboard.`,
  robots: {
    index: false,
    follow: false,
  },
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
