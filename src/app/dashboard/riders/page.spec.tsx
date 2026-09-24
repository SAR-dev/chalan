// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({
    riders: [],
    allRiders: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    taskType: undefined,
    setTaskType: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    setIsActive: vi.fn(),
    onSortChange: vi.fn(),
    isLoading: false,
  }),
}))
vi.mock("@/features/riders/hooks/use-rider-columns", () => ({
  useRiderColumns: () => [],
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const { RidersPageClient } = await import("./riders-client")
  renderPage(
    <RidersPageClient
      initialData={[]}
      initialTotal={0}
       initialCounts={{ active: 0, delivery: 0, pickup: 0 }}
    />,
  )
}

describe("Dashboard riders page", () => {
  it("renders rider management", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /rider/i })).toBeInTheDocument()
  })
})
