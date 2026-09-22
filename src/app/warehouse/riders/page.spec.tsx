// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null
const mockWarehouse: ReturnType<typeof makeUser> | null = null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    currentWarehouse: mockWarehouse ?? {
      id: "w_1",
      name: "Main WH",
      city: "City",
    },
  }),
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
    setIsActive: vi.fn(),
    taskType: undefined,
    setTaskType: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    onSortChange: vi.fn(),
    isLoading: false,
  }),
}))
vi.mock("@/features/riders/hooks/use-rider-columns", () => ({
  useRiderColumns: () => [],
}))
vi.mock("@/features/riders/dialogs/edit-rider-dialog", () => ({
  EditRiderDialog: () => null,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN" })
})

async function importPage() {
  const { WarehouseRidersPageClient } = await import("./riders-client")
  renderPage(<WarehouseRidersPageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse riders page", () => {
  it("renders rider list", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /rider/i })).toBeInTheDocument()
  })
})
