// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
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

describe("Track detail page", () => {
  it("shows not-found for unknown code", async () => {
    await importPage()
    expect(screen.getByText(/parcel not found/i)).toBeInTheDocument()
  })
})
