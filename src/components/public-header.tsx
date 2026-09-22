import { Package } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteConfig } from "@/config/site"

export function PublicHeader() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md shadow-sm transition-shadow group-hover:shadow-md">
            <Package className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
