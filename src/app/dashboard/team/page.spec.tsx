// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/team/hooks/use-team", () => ({
  useTeam: () => ({
    team: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    role: undefined,
    setRole: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    onSortChange: vi.fn(),
    toggleAccountActive: vi.fn(),
    togglePricingPermission: vi.fn(),
    updateAccountWarehouse: vi.fn(),
    isLoading: false,
  }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const { TeamPageClient } = await import("./team-client")
  renderPage(
    <TeamPageClient initialData={[]} initialTotal={0} initialWarehouses={[]} />,
  )
}

describe("Dashboard team page", () => {
  it("renders team management", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /team/i })).toBeInTheDocument()
  })
})
