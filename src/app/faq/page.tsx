import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { Markdown } from "@/components/markdown"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { appContent, siteConfig } from "@/config/site"
import { parseFaqSections } from "./faq-sections"
import { FaqTabs } from "./faq-tabs"

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: `${siteConfig.name} FAQ — answers for merchants, riders, warehouse admins, and super admins about accounts, orders, pricing, prepaid packages, pickups, deliveries, and payouts.`,
}

function replaceContentKeywords(content: string): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, appContent.APP_NAME)
    .replace(/\{\{APP_URL\}\}/g, appContent.APP_URL)
    .replace(/\{\{APP_EMAIL\}\}/g, appContent.APP_EMAIL)
}

export default function FaqPage() {
  const raw = readFileSync(
    join(process.cwd(), "src", "content", "faq.md"),
    "utf-8",
  )
  const { preamble, sections } = parseFaqSections(replaceContentKeywords(raw))

  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Markdown content={preamble} />
        <FaqTabs sections={sections} />
      </div>
      <PublicFooter />
    </div>
  )
}
