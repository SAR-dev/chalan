// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.mock("@/features/announcements/components/announcements-inbox", () => ({
  AnnouncementsInbox: () => <div>Announcements Inbox</div>,
}))

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Rider announcements page", () => {
  it("renders announcements inbox", async () => {
    await importPage()
    expect(screen.getByText("Announcements Inbox")).toBeInTheDocument()
  })
})
