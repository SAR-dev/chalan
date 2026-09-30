// @vitest-environment jsdom

import { screen } from "@testing-library/react"
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

describe("Landing page", () => {
  it("renders marketing content", async () => {
    // The "from" rate now comes from the cheapest configured lane, not from a
    // platform default — the row shape is a `zone_pricing` lane.
    selectQueue.push([
      {
        baseRate: 60,
        extraRatePerKg: 10,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 1,
        cancellationFee: 20,
      },
    ])
    await importPage()
    expect(screen.getByText(/ship anything/i)).toBeInTheDocument()
  })

  it("still renders when no lane is configured", async () => {
    // The sample rate is a build-time fallback for the marketing page only —
    // it must never reach an order.
    selectQueue.push([])
    await importPage()
    expect(screen.getByText(/ship anything/i)).toBeInTheDocument()
  })
})
