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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
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
  const { WarehouseSettlementPageClient } = await import(
    "./cod-settlement-client"
  )
  renderPage(
    <WarehouseSettlementPageClient initialData={[]} initialTotal={0} />,
  )
}

describe("Warehouse COD settlement — section 8", () => {
  it("UNSETTLED tab shows only unsettled DELIVERED orders scoped by warehouse", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_2",
          codSettledAt: null,
        }),
        makeOrder({
          status: "IN_TRANSIT",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
    expect(screen.queryByText("ORD-0003")).not.toBeInTheDocument()
  })

  it("SETTLED tab shows only settled orders (has codSettledAt)", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          codSettledAt: null,
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "DELIVERED",
          codSettledAt: new Date().toISOString(),
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    const settledTabs = screen.getAllByRole("tab", { name: /settled/i })
    await user.click(settledTabs[0])
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
  })

  it("renders empty when currentWarehouse is null", async () => {
    mockWarehouse = null
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
    })
    await importPage()
    expect(screen.getByText(/Nothing to settle/i)).toBeInTheDocument()
  })

  it("shows loading state", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
      isLoading: true,
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
  })

  it("shows SETTLED tab empty message", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    const user = userEvent.setup()
    const settledTabs = screen.getAllByRole("tab", { name: /settled/i })
    await user.click(settledTabs[0])
    expect(screen.getByText(/no settlements/i)).toBeInTheDocument()
  })

  it("opens Settle dialog and submits", async () => {
    const settleFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
      settleOrderCod: settleFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /settle cash/i }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: /^settle$/i }))
    expect(settleFn).toHaveBeenCalled()
  })

  it("shows error toast when settle fails", async () => {
    const { toast } = await import("sonner")
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
      settleOrderCod: vi.fn(() =>
        Promise.resolve({ ok: false, error: "Settle error" }),
      ),
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /settle cash/i }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: /^settle$/i }))
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Settle error")
    })
  })
})
