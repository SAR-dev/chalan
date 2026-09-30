"use client"

import { ChevronDown, ExternalLink } from "lucide-react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pricingUnavailableMessage } from "@/lib/pricing"

/**
 * The standing merchant reference that replaced the setup wizard.
 *
 * The onboarding flow used to walk a new merchant through "how fees work", the
 * route weight limit and where pickup/destination data is configured. Deleting
 * it without putting that knowledge anywhere would leave a merchant who skips
 * help with no way to answer "what will this order cost?" — so the content lives
 * here, on the page every merchant already has a route to.
 *
 * Two properties worth keeping in mind when editing:
 *
 * 1. **It is not a duplicate of `/merchant/pricing`.** That page is live data
 *    (the merchant's own matrix and rate cards); this is the rules those numbers
 *    obey. It links there rather than restating the numbers, which would go
 *    stale the moment a rate changed.
 * 2. **The words are the contract.** An unpriced lane is rejected by name
 *    (see `pricingUnavailableMessage`), so the copy quotes that behaviour
 *    instead of saying "fees may not apply" — a merchant who is told a vague
 *    thing will file a ticket.
 */

interface ReferenceEntry {
  id: string
  question: string
  /** Rendered as paragraphs; kept as React nodes so a claim can link out. */
  body: React.ReactNode
}

const ENTRIES: ReferenceEntry[] = [
  {
    id: "how-fees-work",
    question: "How is my delivery fee calculated?",
    body: (
      <>
        <p>
          Every fee comes from a rate configured for one pair of zones — the
          zone your parcel is picked up in, and the zone it is delivered to.
          There is no platform-wide default rate, so a fee always traces back to
          a specific lane.
        </p>
        <p>
          A lane&apos;s rate has three parts: a <strong>base rate</strong>{" "}
          covering the first few kilograms, an{" "}
          <strong>extra rate per kilogram</strong>
          charged for each kilogram above that allowance (rounded up to the next
          whole kilogram), and the <strong>maximum weight</strong> the lane
          accepts.
        </p>
        <p>
          The zone your parcel is picked up in is the zone of the city on your
          pickup location. The delivery zone is the zone assigned to the
          delivery city you choose. Rates are directional — A → B and B → A are
          separate lanes with separate prices.
        </p>
        <p>
          The fee is calculated and locked in when you create the order, so
          changing a rate afterwards never re-bills an order you already placed.
        </p>
      </>
    ),
  },
  {
    id: "unpriced-lane",
    question: "Why was my order rejected with “no delivery pricing”?",
    body: (
      <>
        <p>
          If no rate is configured for the exact pair of zones your parcel
          needs, the order is rejected rather than charged a guess. The message
          names the lane and the reason, for example:
        </p>
        <p className="border-border bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-xs">
          {pricingUnavailableMessage(
            "no-pricing-for-lane",
            { id: "zone_dhaka_north", name: "Dhaka North" },
            { id: "zone_chattogram", name: "Chattogram" },
          )}
        </p>
        <p>
          The same happens when a city is not yet mapped to a zone, or when the
          delivery city you picked is not one of the configured delivery cities.
          Raise a ticket with the pickup city and delivery city and the platform
          will configure the lane.
        </p>
      </>
    ),
  },
  {
    id: "weight-limit",
    question: "What is the weight limit, and whose limit is it?",
    body: (
      <>
        <p>
          The limit belongs to the lane, not to your account: each configured
          rate carries its own maximum weight, and the order form shows the
          limit for the lane you have selected. A parcel over the limit is
          rejected at creation, with a corrected weight accepted in its place.
        </p>
        <p>
          Because the limit travels with the rate, the same parcel can be
          acceptable on one lane and not another — which is why the form shows
          the limit for your chosen pickup and delivery cities rather than a
          single account-wide number.
        </p>
      </>
    ),
  },
  {
    id: "read-the-matrix",
    question: "How do I read the rate matrix on the Pricing page?",
    body: (
      <>
        <p>
          The matrix is the list of lane rates arranged the way you would ask
          the question. Rows are pickup zones, columns are delivery zones, and a
          cell is the base rate for that lane. Read across a row to see what it
          costs to ship from one zone to anywhere.
        </p>
        <p>
          An em dash (—) means the lane is <em>not configured</em>, not free.
          You cannot create an order on a lane with no rate, and there is no
          fallback to some other lane&apos;s price.
        </p>
        <p>
          <Link
            className="font-medium underline underline-offset-4"
            href="/merchant/pricing"
          >
            Open the Pricing page
          </Link>{" "}
          to see your matrix and each lane&apos;s weight allowance.
        </p>
      </>
    ),
  },
  {
    id: "delivery-cities",
    question: "Which cities can I deliver to?",
    body: (
      <>
        <p>
          You can only deliver to the cities on your configured delivery city
          list — that list decides which zones are reachable, and therefore
          which lanes can be priced. A city missing from the list cannot be
          selected on an order even if the same city name appears elsewhere in
          the app.
        </p>
        <p>
          <Link
            className="font-medium underline underline-offset-4"
            href="/merchant/delivery-cities"
          >
            Open Delivery Cities
          </Link>{" "}
          to see the list. Only the business owner can change it; moderators
          have read-only access.
        </p>
      </>
    ),
  },
  {
    id: "cod-and-earnings",
    question: "How are cash-on-delivery earnings worked out?",
    body: (
      <>
        <p>
          For a cash-on-delivery order, your earnings are the cash amount
          collected from the recipient, minus the delivery fee and the COD
          collection fee. The order page shows this breakdown before dispatch.
        </p>
        <p>
          Earnings are signed: if the fees exceed the cash collected, the order
          is recorded as net-negative rather than clamped to zero, so the debt
          stays visible in your ledger and reports.
        </p>
      </>
    ),
  },
  {
    id: "billing-model",
    question: "What is the difference between a prepaid and COD order?",
    body: (
      <>
        <p>
          A <strong>prepaid</strong> order is paid for before dispatch, so the
          delivery fee is simply a cost of shipping. A{" "}
          <strong>cash-on-delivery</strong> order is paid at the door, and the
          cash you collect has to cover the delivery fee and the collection fee
          first.
        </p>
        <p>
          The payment method is chosen when you create the order and drives both
          the fee breakdown and the payout record, so it cannot be switched
          after dispatch.
        </p>
      </>
    ),
  },
  {
    id: "still-stuck",
    question: "What if my question is not answered here?",
    body: (
      <p>
        Open a ticket with the order id (or the pickup and delivery city) and
        the exact wording of any error you saw. Tickets keep their thread, so
        follow-up replies stay attached to the same problem.
      </p>
    ),
  },
]

/** Compact, dependency-free disclosure list. A native `<details>` keeps the
 *  expand/collapse keyboard-accessible and works without JS state, which is why
 *  this is not a hand-rolled toggle. */
function ReferenceItem({ entry }: { entry: ReferenceEntry }) {
  return (
    <details
      data-testid={`support-reference-${entry.id}`}
      className="group border-border rounded-lg border"
    >
      <summary
        className="hover:bg-muted/40 focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        data-testid={`support-reference-toggle-${entry.id}`}
      >
        <span>{entry.question}</span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="text-muted-foreground space-y-3 border-t px-4 py-3 text-sm leading-relaxed">
        {entry.body}
      </div>
    </details>
  )
}

/**
 * Merchant-only reference block. Rendered above the ticket list on the merchant
 * support page; the admin/warehouse/rider support pages are ticket queues and have
 * no equivalent need, so they pass `null` and get nothing.
 */
export function SupportReference() {
  return (
    <Card data-testid="support-reference">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Delivery &amp; billing reference
          <ExternalLink
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
        </CardTitle>
        <CardDescription>
          How fees, weight limits and delivery coverage work. Open a ticket
          below if the answer is not here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {ENTRIES.map((entry) => (
          <ReferenceItem key={entry.id} entry={entry} />
        ))}
      </CardContent>
    </Card>
  )
}
