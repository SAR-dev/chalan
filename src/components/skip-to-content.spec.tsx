// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SkipToContent } from "./skip-to-content"

describe("SkipToContent", () => {
  it("is the first focusable link and points at the main landmark", () => {
    render(<SkipToContent />)
    const link = screen.getByRole("link", { name: /skip to main content/i })
    expect(link).toHaveAttribute("href", "#main-content")
  })

  it("stays hidden until focused, then becomes visible", () => {
    render(<SkipToContent />)
    const link = screen.getByRole("link", { name: /skip to main content/i })
    // `sr-only` hides it; `focus:not-sr-only` reveals it on keyboard focus.
    expect(link.className).toContain("sr-only")
    expect(link.className).toContain("focus:not-sr-only")
  })

  it("accepts a custom target id", () => {
    render(<SkipToContent targetId="other-region" />)
    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toHaveAttribute("href", "#other-region")
  })
})
