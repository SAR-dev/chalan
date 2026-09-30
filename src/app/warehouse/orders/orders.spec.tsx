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

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const { WarehouseOrdersPageClient } = await import("./orders-client")
  renderPage(<WarehouseOrdersPageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse orders — section 8", () => {
  it("shows all status-matching orders without additional warehouse scoping", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "APPROVED",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "APPROVED",
          warehouseId: "wh_2",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
  })

  it('shows "Cancel order" for cancellable statuses', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(await screen.findByText(/cancel order/i)).toBeInTheDocument()
  })

  it('hides "Cancel order" for non-cancellable statuses', async () => {
    mockOrdersState = createMockOrders({
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
    mockOrdersState = createMockOrders({
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
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no orders to show/i)).toBeInTheDocument()
  })

  it("opens Cancel dialog and submits", async () => {
    const cancelFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
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
    mockOrdersState = createMockOrders({
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
