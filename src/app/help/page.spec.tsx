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
    expect(
      screen.getByRole("link", { name: /merchant guide/i }),
    ).toHaveAttribute("href", "/help/merchant")
    expect(screen.getByRole("link", { name: /rider guide/i })).toHaveAttribute(
      "href",
      "/help/rider",
    )
    expect(screen.getByRole("link", { name: /admin guide/i })).toHaveAttribute(
      "href",
      "/help/admin",
    )
    expect(screen.getByTestId("help-faq-link")).toHaveAttribute("href", "/faq")
  })
})
