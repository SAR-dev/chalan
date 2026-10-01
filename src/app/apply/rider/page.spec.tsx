// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import { siteConfig } from "@/config/site"

vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
)

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Rider apply page", () => {
  it("renders the application form", async () => {
    await importPage()
    expect(screen.getByTestId("rider-name")).toBeInTheDocument()
  })

  // Below `lg` the page header's logo is hidden, so the brand reappears
  // *inside* the bordered card rather than floating above it. Asserted by DOM
  // containment, so it holds at any viewport.
  it("places the mobile brand inside the card, not above it", async () => {
    await importPage()
    const brand = screen.getByTestId("auth-card-brand")
    expect(brand.closest('[data-slot="card"]')?.contains(brand)).toBe(true)
    expect(brand.className).toContain("lg:hidden")
  })

  // The header keeps exactly one logo. Hiding it below `lg` (where it moves
  // into the card) must not leave a second copy visible on desktop.
  it("shows the header logo only from lg up, so the mark is not duplicated", async () => {
    await importPage()
    const headerLink = screen
      .getByRole("link", { name: siteConfig.name })
      .closest("header")
    expect(headerLink).not.toBeNull()
    // The header logo link is the one NOT carrying the in-card testid.
    const logos = Array.from(headerLink?.querySelectorAll("a") ?? []).filter(
      (a) => a.textContent?.includes(siteConfig.name),
    )
    expect(logos).toHaveLength(1)
    expect(logos[0].className).toContain("hidden")
    expect(logos[0].className).toContain("lg:flex")
  })

  // With the header logo hidden on mobile, the Print button is the header's
  // only child — it must stay right-aligned rather than jump to the left.
  it("keeps the print button right-aligned while the header logo is hidden", async () => {
    await importPage()
    const row = screen
      .getByTestId("rider-apply-print")
      .closest("header")
      ?.querySelector("div")
    expect(row?.className).toContain("justify-end")
    expect(row?.className).toContain("lg:justify-between")
  })
})
