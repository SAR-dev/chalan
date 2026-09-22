import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { Markdown } from "@/components/markdown"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { appContent, siteConfig } from "@/config/site"

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: `${siteConfig.name} terms and conditions governing use of the platform.`,
}

function replaceContentKeywords(content: string): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, appContent.APP_NAME)
    .replace(/\{\{APP_URL\}\}/g, appContent.APP_URL)
    .replace(/\{\{APP_EMAIL\}\}/g, appContent.APP_EMAIL)
}

export default function TermsPage() {
  const raw = readFileSync(
    join(process.cwd(), "src", "content", "terms.md"),
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
