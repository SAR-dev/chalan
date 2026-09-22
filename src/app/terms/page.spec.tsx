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
    expect(screen.getByRole("heading", { name: /terms/i })).toBeInTheDocument()
  })
})
