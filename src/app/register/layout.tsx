import type { Metadata } from "next"
import { ReactNode } from "react"
import { siteConfig } from "@/config/site"

const title = `Create Merchant Account – ${siteConfig.name}`
const description = `Register your business on ${siteConfig.name} and start booking deliveries across Bangladesh. First 100 merchants get 10% off forever.`
const ogDescription = `Register your business and start shipping with ${siteConfig.name}. Transparent pricing, real-time tracking, and fast approval.`

export const metadata: Metadata = {
  title: "Create Merchant Account",
  description,
  alternates: {
    canonical: "/register",
  },
  openGraph: {
    title,
    description: ogDescription,
    url: "/register",
  },
  twitter: {
    title,
    description: ogDescription,
  },
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
