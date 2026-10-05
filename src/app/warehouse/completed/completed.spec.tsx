// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  makeWarehouse,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    currentWarehouse: mockWarehouse,
    warehouses: mockWarehouse ? [mockWarehouse] : [],
  }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockWarehouse: ReturnType<typeof makeWarehouse> | null
let mockOrdersState: MockOrdersState
let mockSetStatuses: Mock<(statuses?: string[]) => void>

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockSetStatuses = vi.fn()
  mockOrdersState = createMockOrders({ setStatuses: mockSetStatuses })
})

async function importPage() {
  const { WarehouseCompletedPageClient } = await import("./completed-client")
  renderPage(<WarehouseCompletedPageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse completed orders", () => {
  it("defaults to every closed status", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "DELIVERED" })],
      setStatuses: mockSetStatuses,
    })
    await importPage()
    // DELIVERED + CANCELLED + RETURNED — decision #1. RETURNED is terminal, so
    // it belongs here rather than on the Exceptions page.
    expect(mockSetStatuses).toHaveBeenCalledWith([
      "DELIVERED",
      "CANCELLED",
      "RETURNED",
    ])
  })

  it("narrows the server query when a tab is picked", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "RETURNED" })],
      setStatuses: mockSetStatuses,
    })
    await importPage()
    mockSetStatuses.mockClear()

    await userEvent.click(screen.getByTestId("completed-tab-RETURNED"))
    expect(mockSetStatuses).toHaveBeenCalledWith(["RETURNED"])
  })

  it("lists a returned parcel with its reason", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "RETURNED",
          returnReason: "Receiver refused parcel",
          failedResolvedBy: "Warehouse Admin",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("Receiver refused parcel")).toBeInTheDocument()
    expect(screen.getByText("Resolved by")).toBeInTheDocument()
  })

  it("shows a dash, not a blank cell, for non-returned rows", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "DELIVERED", returnReason: null })],
    })
    await importPage()
    // An empty cell reads as a rendering bug; an explicit dash reads as
    // "there was no reason to record".
    expect(screen.getByText("Outcome")).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("is read-only — no actions column and no row selection", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "DELIVERED" })],
    })
    await importPage()
    // A closed parcel has nothing left to do to it, so the page offers nothing.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
    expect(screen.queryByTestId(/action/i)).not.toBeInTheDocument()
  })

  it("shows the empty message when nothing is closed", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no closed parcels/i)).toBeInTheDocument()
  })
})
