// Registry of the public help articles rendered from `src/content/docs/*.md`.
// Lives next to the help routes (not a route file itself) so the index page
// and the `[slug]` detail page share one source of truth for slugs, titles,
// and descriptions.

export interface HelpGuide {
  /** URL segment: /help/<slug> */
  slug: string
  /** H1 shown on the guide page and in the index list. */
  title: string
  /** One-line summary shown under the title on the index page. */
  description: string
  /** File name inside src/content/docs. */
  file: string
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "merchant",
    title: "Merchant guide",
    description:
      "Register and verify your business, book orders, follow deliveries, understand COD charges, and request payouts.",
    file: "merchant.md",
  },
  {
    slug: "rider",
    title: "Rider guide",
    description:
      "Work your pickup and delivery queues, record outcomes with proof photos, and check your cash earnings.",
    file: "rider.md",
  },
  {
    slug: "admin",
    title: "Admin guide",
    description:
      "Approve merchants, orders, and payouts; manage warehouses, riders, and zone pricing; reconcile COD and read audit logs.",
    file: "admin.md",
  },
]

export function helpGuideFor(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.slug === slug)
}
