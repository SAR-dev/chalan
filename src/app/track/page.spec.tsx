// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

const mockRedirect = vi.fn()
vi.mock("next/navigation", () => ({ redirect: mockRedirect }))

async function importPage(searchParams = { code: "" }) {
  const Page = (await import("./page")).default
  const Component = await Page({ searchParams: Promise.resolve(searchParams) })
  renderPage(Component)
}

describe("Track page", () => {
  it("renders tracking search form", async () => {
    await importPage()
    expect(screen.getByPlaceholderText(/tracking code/i)).toBeInTheDocument()
  })

  it("redirects when code is provided", async () => {
    await importPage({ code: "PF-123" })
    expect(mockRedirect).toHaveBeenCalledWith("/track/PF-123")
  })
})
