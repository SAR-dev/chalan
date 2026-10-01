import {
  ArrowRight,
  Bike,
  CircleHelp,
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

const GUIDE_ICONS: Record<
  string,
  React.ComponentType<{
    className?: string
  }>
> = {
  merchant: PackageSearch,
  rider: Bike,
  "warehouse-admin": Warehouse,
  admin: ScrollText,
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

        <div className="flex flex-col gap-4">
          {HELP_GUIDES.map((guide) => {
            const Icon = GUIDE_ICONS[guide.slug] ?? CircleHelp
            return (
              <Link
                key={guide.slug}
                href={`/help/${guide.slug}`}
                data-testid={`help-guide-${guide.slug}`}
                className="group block"
              >
                <Card className="border-border/60 group-hover:border-primary/40 transition-colors">
                  <CardContent className="flex items-start gap-4 p-5">
                    <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="group-hover:text-primary flex items-center gap-2 font-semibold transition-colors">
                        {guide.title}
                        <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
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
