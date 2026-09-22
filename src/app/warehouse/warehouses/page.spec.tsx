// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    warehouses: [],
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
  }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN" })
})

async function importPage() {
  const { default: Page } = await import("./warehouses-client")
  renderPage(<Page />)
}

describe("Warehouse warehouses page", () => {
  it("renders warehouse list", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /warehouse/i }),
    ).toBeInTheDocument()
  })
})
