import type { Metadata } from "next"
import { ReactNode } from "react"
import { siteConfig } from "@/config/site"

const title = `Apply as Rider – ${siteConfig.name}`
const description = `Join ${siteConfig.name} as a delivery rider. Apply online, get approved, and start earning with a nationwide delivery network.`
const ogDescription = `Become a ${siteConfig.name} rider. Flexible schedules, real-time order tracking, and a growing delivery network.`

export const metadata: Metadata = {
  title: "Apply as Rider",
  description,
  alternates: {
    canonical: "/apply/rider",
  },
  openGraph: {
    title,
    description: ogDescription,
    url: "/apply/rider",
  },
  twitter: {
    title,
    description: ogDescription,
  },
}

export default function ApplyRiderLayout({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}
