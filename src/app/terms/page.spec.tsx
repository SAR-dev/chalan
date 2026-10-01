// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Terms page", () => {
  it("renders terms heading", async () => {
    await importPage()
    // Scoped to level 1: the document legitimately contains other headings that
    // mention "Terms" (section 9, "Changes to These Terms"), so an unscoped
    // role query matches more than one and throws rather than asserting.
    expect(
      screen.getByRole("heading", { level: 1, name: /terms and conditions/i }),
    ).toBeInTheDocument()
  })
})
