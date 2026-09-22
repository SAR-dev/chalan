// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/email-logs/hooks/use-email-logs", () => ({
  useEmailLogs: () => ({
    emailLogs: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    onSortChange: vi.fn(),
    isLoading: false,
    markAsSent: vi.fn(),
    markAsSentBulk: vi.fn(),
  }),
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

describe("Dashboard email-logs page", () => {
  it("renders email logs", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /email/i })).toBeInTheDocument()
  })
})
