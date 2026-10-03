// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeOrder, renderPage } from "@/app/__tests__/test-utils"

const dbQueue = vi.hoisted(() => {
  const rows: unknown[][] = []
  return {
    enqueue: (...results: unknown[][]) => {
      rows.push(...results)
    },
    reset: () => {
      rows.length = 0
    },
    next: () => (rows.length > 0 ? (rows.shift() as unknown[]) : []),
  }
})

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(dbQueue.next()),
        }),
      }),
    }),
  },
}))
vi.mock("@/lib/db/schema", () => ({
  order: {},
  merchant: {},
  rider: {},
  warehouse: {},
}))

async function importPage(id = "PF-UNKNOWN") {
  const Page = (await import("./page")).default
  const Component = await Page({ params: Promise.resolve({ id }) })
  renderPage(Component)
}

const TRACKING_TOKEN = "a".repeat(32)

const orderRow = (trackingToken: string | null = null) => [
  makeOrder({
    warehouseId: undefined,
    pickupRiderId: null,
    deliveryRiderId: null,
    trackingToken,
  }),
]

const merchantRow = () => [
  {
    id: "m_1",
    businessName: "Acme Goods",
  },
]

describe("Track detail page", () => {
  it("shows not-found for unknown code", async () => {
    dbQueue.reset()
    await importPage()
    expect(screen.getByText(/parcel not found/i)).toBeInTheDocument()
  })

  it("names the fulfilling merchant in the header", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(), [
      {
        id: "m_1",
        businessName: "Acme Goods",
      },
    ])
    await importPage("ORD-BRAND-1")

    // Branding (colour / hide-platform toggle) was removed; what the header
    // shows is the merchant's business name, which is identity, not branding.
    expect(screen.getByTestId("track-brand")).toHaveTextContent(
      "Fulfilled by Acme Goods",
    )
    expect(screen.getByText(/All rights reserved/i)).toBeInTheDocument()
  })

  it("always shows the platform footer", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(), [
      {
        id: "m_1",
        businessName: "Acme Goods",
      },
    ])
    await importPage("ORD-BRAND-2")

    expect(screen.getByTestId("track-brand")).toHaveTextContent(
      "Fulfilled by Acme Goods",
    )
    // Unconditional since the `hidePlatformBranding` toggle was removed.
    expect(screen.getByText(/All rights reserved/i)).toBeInTheDocument()
  })

  it("falls back to platform identity for unknown codes", async () => {
    dbQueue.reset()
    await importPage("PF-UNKNOWN-2")
    expect(screen.getByText(/parcel not found/i)).toBeInTheDocument()
    expect(screen.getByTestId("track-brand")).not.toHaveTextContent(
      "Fulfilled by",
    )
    expect(screen.queryByTestId("track-brand-logo")).not.toBeInTheDocument()
  })

  it("enables the recipient note form when opened with the tracking token", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(TRACKING_TOKEN), merchantRow())
    await importPage(TRACKING_TOKEN)

    expect(screen.getByRole("textbox")).toBeInTheDocument()
    expect(
      screen.queryByText(/Open the tracking link shared with you/i),
    ).not.toBeInTheDocument()
  })

  it("hides the note form when opened with the human order code", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(TRACKING_TOKEN), merchantRow())
    await importPage("ORD-CODE-ONLY")

    expect(
      screen.getByText(/Open the tracking link shared with you/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    // Code lookups render the minimal view: no shipment details.
    expect(screen.queryByText(/shipment details/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/cash on delivery/i)).not.toBeInTheDocument()
  })
})
