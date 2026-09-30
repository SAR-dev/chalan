// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SupportReference } from "@/features/support/components/support-reference"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

describe("SupportReference", () => {
  it("answers the questions the onboarding wizard used to answer", () => {
    render(<SupportReference />)

    // These are the five things the deleted wizard walked a merchant through. If
    // one of them stops being documented, the wizard is not actually replaced —
    // the merchant is simply left without an answer.
    expect(
      screen.getByText("How is my delivery fee calculated?"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/What is the weight limit, and whose limit is it\?/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/How do I read the rate matrix on the Pricing page\?/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Which cities can I deliver to\?/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Why was my order rejected with “no delivery pricing”\?/,
      ),
    ).toBeInTheDocument()
  })

  it("quotes the real rejection sentence rather than paraphrasing it", () => {
    render(<SupportReference />)

    // The copy must not drift from `pricingUnavailableMessage` — a merchant
    // told a vaguer thing will file a ticket, which is the thing this section
    // exists to prevent.
    const entry = screen.getByTestId("support-reference-unpriced-lane")
    expect(entry).toHaveTextContent(
      "No delivery pricing is configured for Dhaka North → Chattogram",
    )
  })

  it("says an unpriced lane is rejected, not free", () => {
    render(<SupportReference />)

    // The em dash is the trap: read alone it looks like zero. Both the matrix
    // entry and the rejection entry have to say what it really means.
    const matrix = screen.getByTestId("support-reference-read-the-matrix")
    expect(matrix).toHaveTextContent(/not configured/i)
    expect(matrix).toHaveTextContent(/not free/i)
    expect(matrix).toHaveTextContent(/cannot create an order/i)

    const rejection = screen.getByTestId("support-reference-unpriced-lane")
    expect(rejection).toHaveTextContent(/rejected rather than charged a guess/i)
  })

  it("links out to the live pages instead of restating their numbers", () => {
    render(<SupportReference />)

    // Live figures change; the reference explains the rules. Duplicating a rate
    // here would guarantee a stale copy.
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(links).toContain("/merchant/pricing")
    expect(links).toContain("/merchant/delivery-cities")
  })

  it("gives every disclosure a real toggle with an addressable target", () => {
    render(<SupportReference />)

    const entries = screen.getAllByRole("group")
    expect(entries.length).toBeGreaterThanOrEqual(8)
    for (const entry of entries) {
      const id = entry.getAttribute("data-testid")
      expect(id).toMatch(/^support-reference-/)
      // A disclosure whose summary is missing is not operable.
      expect(
        screen.getByTestId(
          `support-reference-toggle-${id!.replace("support-reference-", "")}`,
        ),
      ).toBeInTheDocument()
    }
  })

  it("keeps the explanatory text inside the disclosure, not the summary", () => {
    render(<SupportReference />)

    const summary = screen.getByTestId("support-reference-toggle-how-fees-work")
    // The summary is the question only — a summary carrying the answer makes the
    // collapsed list unreadable.
    expect(summary.textContent).not.toMatch(/base rate covers/i)
    // The chevron is decorative, so it must not reach the accessibility tree.
    expect(summary.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })
})
