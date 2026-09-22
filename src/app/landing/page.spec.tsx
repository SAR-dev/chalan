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
    selectQueue.push([{ defaultBaseRate: 60 }])
    await importPage()
    expect(screen.getByText(/ship anything/i)).toBeInTheDocument()
  })
})
