// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const selectQueue: unknown[][] = []
vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = { select: () => makeSelectChain() }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(await Page())
}

const ZONES = [{ id: "z1", name: "Dhaka Metro" }]

const CITIES = [
  { id: "c1", name: "Dhaka", zoneId: "z1" },
  { id: "c2", name: "Chattogram", zoneId: "z1" },
]

const PRICING = [
  {
    fromZoneId: "z1",
    toZoneId: "z1",
    baseRate: 60,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    cancellationFee: 5,
  },
]

describe("Public pricing page", () => {
  it("renders the city-to-city rate matrix", async () => {
    selectQueue.push(ZONES, CITIES, PRICING)
    await importPage()

    expect(
      screen.getByRole("heading", { name: /city-to-city rates/i }),
    ).toBeInTheDocument()
    // Scoped to the matrix table: the page also renders a stacked list below
    // `sm` for phones, so a page-wide count would see each value twice.
    const matrix = within(screen.getByTestId("pricing-table"))
    const cancellation = within(screen.getByTestId("cancellation-fee-table"))
    // Destination header + origin row labels.
    expect(matrix.getAllByText("Dhaka")).toHaveLength(2)
    expect(matrix.getAllByText("Chattogram")).toHaveLength(2)
    // Both pairs share the same zone → every cell of the 2×2 grid shows 60 TK
    // in the delivery matrix and 5 TK in the cancellation matrix.
    expect(matrix.getAllByText("60 TK")).toHaveLength(4)
    expect(cancellation.getAllByText("5 TK")).toHaveLength(4)
  })

  it("shows an empty state when no routes are published", async () => {
    selectQueue.push(ZONES, [], [])
    await importPage()

    expect(
      screen.getByText(/no delivery routes have been published yet/i),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("pricing-table")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("cancellation-fee-table"),
    ).not.toBeInTheDocument()
  })
})
