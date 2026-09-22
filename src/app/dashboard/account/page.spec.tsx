// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.mock("@/features/account/components/account-settings", () => ({
  AccountSettings: () => <div data-testid="account-settings">Settings</div>,
}))

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Dashboard account page", () => {
  it("renders account settings", async () => {
    await importPage()
    expect(screen.getByTestId("account-settings")).toBeInTheDocument()
  })
})
