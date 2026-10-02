// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ActivatedPage from "./page"

describe("/activated", () => {
  it("welcomes the freshly activated account", () => {
    render(<ActivatedPage />)
    expect(screen.getByTestId("activated-title")).toHaveTextContent(/welcome/i)
    expect(screen.getByTestId("activated-message")).toHaveTextContent(
      /signed out/i,
    )
  })

  it("sends them to sign in", () => {
    render(<ActivatedPage />)
    const cta = screen.getByTestId("activated-continue")
    expect(cta.tagName).toBe("A")
    expect(cta).toHaveAttribute("href", "/login")
    expect(cta).toHaveTextContent(/continue to sign in/i)
  })

  it("keeps the skip-link target the page's main landmark", () => {
    render(<ActivatedPage />)
    expect(document.querySelector("main#main-content")).not.toBeNull()
  })

  // The single-column screens carry their own brand, so the lockup must not
  // disappear at `lg` the way it does on the split-layout pages.
  it("places the brand inside the card, visible at every width", () => {
    render(<ActivatedPage />)

    const brand = screen.getByTestId("auth-card-brand")
    const card = brand.closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card?.contains(brand)).toBe(true)
    expect(brand.className).not.toContain("lg:hidden")
    // Centred, matching the header it now sits in.
    expect(brand.className).toContain("justify-center")
  })
})
