// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import { pageContent } from "@/config/content"

vi.mock("@/features/announcements/hooks/use-active-announcements", () => ({
  useActiveAnnouncements: () => ({ announcements: [] }),
  useAnnouncementFeed: () => ({
    announcements: [],
    isNew: () => false,
    isLoading: false,
    error: undefined,
  }),
}))

async function importPage() {
  const { AnnouncementsInboxClient } = await import("./inbox-client")
  renderPage(
    <AnnouncementsInboxClient
      title={pageContent.dashboard.announcementsInbox.title}
      description={pageContent.dashboard.announcementsInbox.description}
      initialAnnouncements={[]}
    />,
  )
}

describe("Dashboard announcements-inbox page", () => {
  it("renders the announcements feed", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /announcements/i }),
    ).toBeInTheDocument()
  })
})
