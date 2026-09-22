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
})
