import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { Markdown } from "@/components/markdown"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { siteConfig } from "@/config/site"
import { replaceContentKeywords } from "@/lib/content-keywords"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `${siteConfig.name} privacy policy explaining how we collect, use, and protect your data.`,
}

export default function PrivacyPage() {
  const raw = readFileSync(
    join(process.cwd(), "src", "content", "privacy.md"),
    "utf-8",
  )

  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Markdown content={replaceContentKeywords(raw)} />
      </div>
      <PublicFooter />
    </div>
  )
}
