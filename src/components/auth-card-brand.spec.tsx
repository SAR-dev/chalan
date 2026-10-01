// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AuthCardBrand } from "@/components/auth-card-brand"
import { siteConfig } from "@/config/site"

describe("AuthCardBrand", () => {
  it("links home and shows the configured brand name", () => {
    render(<AuthCardBrand />)
    const link = screen.getByTestId("auth-card-brand")
    expect(link).toHaveAttribute("href", "/")
    expect(link).toHaveTextContent(siteConfig.name)
  })

  it("honours an explicit href", () => {
    render(<AuthCardBrand href="/help" />)
    expect(screen.getByTestId("auth-card-brand")).toHaveAttribute(
      "href",
      "/help",
    )
  })

  // The lockup only exists below `lg` — from `lg` up the logo lives in the
  // page's own brand panel / header, so showing it twice would duplicate it.
  it("is hidden from lg up, where the page's brand panel takes over", () => {
    render(<AuthCardBrand />)
    expect(screen.getByTestId("auth-card-brand").className).toContain(
      "lg:hidden",
    )
  })

  it("is left-aligned by default and centred on request", () => {
    const { rerender } = render(<AuthCardBrand />)
    expect(screen.getByTestId("auth-card-brand").className).not.toContain(
      "justify-center",
    )
    rerender(<AuthCardBrand center />)
    expect(screen.getByTestId("auth-card-brand").className).toContain(
      "justify-center",
    )
  })

  it("merges caller spacing without dropping the lg:hidden rule", () => {
    render(<AuthCardBrand className="mb-3" />)
    const cls = screen.getByTestId("auth-card-brand").className
    expect(cls).toContain("mb-3")
    expect(cls).toContain("lg:hidden")
  })
})
