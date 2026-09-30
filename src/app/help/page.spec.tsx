// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Help center page", () => {
  it("renders the help heading", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /help center/i }),
    ).toBeInTheDocument()
  })

  it("links to every guide", async () => {
    await importPage()
    const guides: [string, string][] = [
      ["merchant", "Merchant guide"],
      ["rider", "Rider guide"],
      ["warehouse-admin", "Warehouse admin guide"],
      ["admin", "Admin guide"],
    ]
    for (const [slug, title] of guides) {
      const link = screen.getByTestId(`help-guide-${slug}`)
      expect(link).toHaveAttribute("href", `/help/${slug}`)
      expect(link).toHaveTextContent(title)
    }
    expect(screen.getByTestId("help-faq-link")).toHaveAttribute("href", "/faq")
  })
})
