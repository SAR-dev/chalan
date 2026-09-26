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

const orderRow = () => [
  makeOrder({
    warehouseId: undefined,
    pickupRiderId: null,
    deliveryRiderId: null,
  }),
]

describe("Track detail page", () => {
  it("shows not-found for unknown code", async () => {
    dbQueue.reset()
    await importPage()
    expect(screen.getByText(/parcel not found/i)).toBeInTheDocument()
  })

  it("shows merchant branding for a branded order", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(), [
      {
        id: "m_1",
        businessName: "Acme Goods",
        logoUrl: "/placeholder.svg",
        brandColor: "#2563eb",
        hidePlatformBranding: false,
      },
    ])
    await importPage("ORD-BRAND-1")

    expect(screen.getByTestId("track-brand")).toHaveTextContent(
      "Fulfilled by Acme Goods",
    )
    expect(screen.getByTestId("track-brand-logo")).toBeInTheDocument()
    expect(screen.getByTestId("track-accent")).toBeInTheDocument()
    // Platform footer stays when hidePlatformBranding is off
    expect(screen.getByText(/All rights reserved/i)).toBeInTheDocument()
  })

  it("hides the platform footer when hidePlatformBranding is set", async () => {
    dbQueue.reset()
    dbQueue.enqueue(orderRow(), [
      {
        id: "m_1",
        businessName: "Acme Goods",
        brandColor: "#f97316",
        hidePlatformBranding: true,
      },
    ])
    await importPage("ORD-BRAND-2")

    expect(screen.getByTestId("track-brand")).toHaveTextContent(
      "Fulfilled by Acme Goods",
    )
    // No logo uploaded → default chip instead of an <img>
    expect(screen.queryByTestId("track-brand-logo")).not.toBeInTheDocument()
    expect(screen.getByTestId("track-accent")).toBeInTheDocument()
    expect(screen.queryByText(/All rights reserved/i)).not.toBeInTheDocument()
  })

  it("falls back to platform identity for unknown codes", async () => {
    dbQueue.reset()
    await importPage("PF-UNKNOWN-2")
    expect(screen.getByText(/parcel not found/i)).toBeInTheDocument()
    expect(screen.getByTestId("track-brand")).not.toHaveTextContent(
      "Fulfilled by",
    )
    expect(screen.queryByTestId("track-brand-logo")).not.toBeInTheDocument()
    expect(screen.queryByTestId("track-accent")).not.toBeInTheDocument()
  })
})
