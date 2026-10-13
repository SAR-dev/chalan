import {
  ArrowRight,
  Bike,
  CircleHelp,
  Code2,
  PackageSearch,
  ScrollText,
  Warehouse,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { PublicFooter } from "@/components/public-footer"
import { PublicHeader } from "@/components/public-header"
import { Card, CardContent } from "@/components/ui/card"
import { siteConfig } from "@/config/site"
import { HELP_GUIDES } from "./guides"

export const metadata: Metadata = {
  title: "Help Center",
  description: `${siteConfig.name} help center — task-by-task guides for merchants, riders, warehouse admins, and super admins.`,
}

/**
 * One hue per role, so the list reads as a set rather than five identical rows.
 *
 * Drawn from the same `BADGE_TONES` vocabulary the order status badges and the
 * notification icons use. Each icon sits on a tint at 15% alpha — the badge
 * background half, not the border half, since a rounded square here has no
 * border to colour.
 */
const GUIDE_STYLES: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; chip: string }
> = {
  merchant: { icon: PackageSearch, chip: "bg-chart-1/15 text-chart-1" },
  rider: { icon: Bike, chip: "bg-chart-3/15 text-chart-3" },
  "warehouse-admin": {
    icon: Warehouse,
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  admin: {
    icon: ScrollText,
    chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  // Was missing entirely, so the API guide fell back to a generic question mark
  // and read as "no icon available" rather than "for developers".
  api: {
    icon: Code2,
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
}

export default function HelpPage() {
  return (
    <div className="bg-background text-foreground min-h-screen font-sans antialiased">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <PageHeader
          title="Help Center"
          description={`Task-by-task guides for every ${siteConfig.name} role, covering accounts, orders, pricing, packages, and payouts.`}
        />

        <div className="flex flex-col gap-3">
          {HELP_GUIDES.map((guide) => {
            const style = GUIDE_STYLES[guide.slug] ?? {
              icon: CircleHelp,
              chip: "bg-muted text-muted-foreground",
            }
            const Icon = style.icon
            return (
              <Link
                key={guide.slug}
                href={`/help/${guide.slug}`}
                data-testid={`help-guide-${guide.slug}`}
                className="group block"
              >
                <Card className="border-border/60 group-hover:border-primary/40 transition-colors">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${style.chip}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="group-hover:text-primary flex items-center gap-1.5 font-semibold transition-colors">
                        <span className="truncate">{guide.title}</span>
                        <ArrowRight
                          className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                        {guide.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <p className="text-muted-foreground mt-8 text-sm">
          Tracking a parcel? Open the{" "}
          <Link href="/track" className="text-primary hover:underline">
            tracking page
          </Link>{" "}
          and paste your code — no account needed.
        </p>
      </div>
      <PublicFooter />
    </div>
  )
}
