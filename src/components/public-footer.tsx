import Link from "next/link"
import { SiteIcon, siteConfig } from "@/config/site"

export function PublicFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs sm:flex-row">
        <div className="flex items-center gap-2">
          <SiteIcon className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </span>
        </div>
        <div className="text-muted-foreground flex flex-wrap justify-center gap-5">
          <Link href="/faq" className="hover:text-foreground transition-colors">
            FAQ
          </Link>
          <Link
            href="/rates"
            className="hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/help"
            className="hover:text-foreground transition-colors"
          >
            Help center
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/track"
            className="hover:text-foreground transition-colors"
          >
            Track a parcel
          </Link>
        </div>
      </div>
    </footer>
  )
}
