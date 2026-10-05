// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  makeWarehouse,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"
import { statCardLabels } from "@/config/stat-card-labels"

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
let mockSetStatuses: (statuses?: string[]) => void

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockSetStatuses = vi.fn()
  // `setStatuses` is the queue's filter control, so the spec observes it
  // directly rather than inferring the filter from rendered rows.
  mockOrdersState = mockOrders({})
})

/** Build the hook's state with the observed `setStatuses` still attached. */
function mockOrders(overrides: Parameters<typeof createMockOrders>[0]) {
  return createMockOrders({ ...overrides, setStatuses: mockSetStatuses })
}

async function importPage() {
  const { WarehouseOrdersPageClient } = await import("./orders-client")
  renderPage(<WarehouseOrdersPageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse order approval", () => {
  it("wires the queue to PENDING only", async () => {
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    // The status filter is what makes this page an approval queue rather than
    // an order list, so assert the wiring rather than the rendered rows.
    expect(mockSetStatuses).toHaveBeenCalledWith(["PENDING"])
  })

  it("offers no status tabs", async () => {
    // Every other status has a page of its own (decision #2), so a tab here
    // would be a second place to look for the same parcel.
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
  })

  it("shows no stat cards", async () => {
    // The overview owns the counts; a second copy here could disagree with it.
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    expect(
      screen.queryByText(statCardLabels.warehouse.orders.pendingApproval.label),
    ).not.toBeInTheDocument()
  })

  it("shows all status-matching orders without additional warehouse scoping", async () => {
    mockOrdersState = mockOrders({
      orders: [
        makeOrder({
          status: "PENDING",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "PENDING",
          warehouseId: "wh_2",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
  })

  it('shows "Cancel order" for cancellable statuses', async () => {
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(await screen.findByText(/cancel order/i)).toBeInTheDocument()
  })

  it('hides "Cancel order" for non-cancellable statuses', async () => {
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "DELIVERED" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      screen.queryByRole("menuitem", { name: /cancel order/i }),
    ).not.toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
      isLoading: true,
    })
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
  })

  it("shows empty message", async () => {
    mockOrdersState = mockOrders({ orders: [] })
    await importPage()
    expect(
      screen.getByText(/no orders are waiting for approval/i),
    ).toBeInTheDocument()
  })

  it("opens Cancel dialog and submits", async () => {
    const cancelFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
      cancelOrder: cancelFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByText(/cancel order/i))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /cancel order$/i }),
    )
    expect(cancelFn).toHaveBeenCalled()
  })

  it("shows error toast when cancel fails", async () => {
    const { toast } = await import("sonner")
    mockOrdersState = mockOrders({
      orders: [makeOrder({ status: "PENDING" })],
      cancelOrder: vi.fn(() =>
        Promise.resolve({ ok: false, error: "Cancel error" }),
      ),
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByText(/cancel order/i))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /cancel order$/i }),
    )
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Cancel error")
    })
  })
})
