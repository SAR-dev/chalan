import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Markdown } from "@/components/markdown"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { appContent, siteConfig } from "@/config/site"
import { helpGuideFor } from "../guides"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = helpGuideFor(slug)
  if (!guide) {
    return { title: "Guide not found" }
  }
  return {
    title: guide.title,
    description: `${siteConfig.name} help — ${guide.description}`,
  }
}

function replaceContentKeywords(content: string): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, appContent.APP_NAME)
    .replace(/\{\{APP_URL\}\}/g, appContent.APP_URL)
    .replace(/\{\{APP_EMAIL\}\}/g, appContent.APP_EMAIL)
}

export default async function HelpGuidePage({ params }: Props) {
  const { slug } = await params
  const guide = helpGuideFor(slug)
  if (!guide) notFound()

  const raw = readFileSync(
    join(process.cwd(), "src", "content", "docs", guide.file),
    "utf-8",
  )

  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/help"
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Help Center
        </Link>
        <Markdown content={replaceContentKeywords(raw)} />
      </div>
      <PublicFooter />
    </div>
  )
}
