// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }),
)

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Register page", () => {
  it("renders registration form", async () => {
    await importPage()
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument()
  })

  // Below `lg` the brand panel is hidden, so the logo has to reappear. It
  // lives inside the bordered card (not floating above it) so a phone shows
  // one framed box. Asserted by DOM containment, so it holds at any viewport.
  it("places the mobile brand inside the card, not above it", async () => {
    await importPage()
    const brand = screen.getByTestId("auth-card-brand")
    const card = brand.closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card?.contains(brand)).toBe(true)
    expect(brand.className).toContain("lg:hidden")
  })
})
