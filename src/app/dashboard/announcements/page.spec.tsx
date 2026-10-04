// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("next/navigation", () => ({
  // The page navigates to the create/edit pages from here.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/features/announcements/hooks/use-announcements", () => ({
  useAnnouncements: () => ({ announcements: [], total: 0, isLoading: false }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Dashboard announcements page", () => {
  it("renders announcements management", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /announcement/i }),
    ).toBeInTheDocument()
  })
})
