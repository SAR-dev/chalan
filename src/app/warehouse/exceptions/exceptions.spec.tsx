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
  const { WarehouseExceptionsPageClient } = await import("./exceptions-client")
  renderPage(
    <WarehouseExceptionsPageClient initialData={[]} initialTotal={0} />,
  )
}

describe("Warehouse exceptions — section 5", () => {
  it("NEEDS_ACTION tab filters by warehouse and FAILED_ATTEMPT status", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_2",
        }),
        makeOrder({
          status: "RETURNED",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
    expect(screen.queryByText("ORD-0003")).not.toBeInTheDocument()
  })

  it("RESOLVED tab filters by warehouse and RETURNED status", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "RETURNED",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "RETURNED",
          warehouseId: "wh_2",
        }),
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /returned/i }))
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
    expect(screen.queryByText("ORD-0003")).not.toBeInTheDocument()
  })

  it('shows "Resolve" for FAILED_ATTEMPT orders in the assigned warehouse', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      await screen.findByRole("menuitem", { name: /resolve/i }),
    ).toBeInTheDocument()
  })

  it('hides "Resolve" when warehouseId does not match', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_2" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument()
  })

  it('hides "Resolve" on RESOLVED tab', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "RETURNED", warehouseId: "wh_1" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /returned/i }))
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await screen.findByRole("menuitem", { name: /no actions/i })
    expect(
      screen.queryByRole("menuitem", { name: /resolve/i }),
    ).not.toBeInTheDocument()
  })

  it("shows empty message when no exceptions", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no failed deliveries/i)).toBeInTheDocument()
  })

  it("renders empty when currentWarehouse is null", async () => {
    mockWarehouse = null
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument()
  })

  it("shows loading state", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
        }),
      ],
      isLoading: true,
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
  })

  it("shows RESOLVED tab empty message", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /returned/i }))
    expect(screen.getByText(/nothing returned/i)).toBeInTheDocument()
  })

  it("opens Resolve dialog and submits with default REATTEMPT", async () => {
    const reattemptFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
      reattemptFailedOrder: reattemptFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByRole("menuitem", { name: /resolve/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /send back out/i }),
    )
    expect(reattemptFn).toHaveBeenCalled()
  })

  it("shows error toast when resolve fails", async () => {
    const { toast } = await import("sonner")
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
      reattemptFailedOrder: vi.fn(() =>
        Promise.resolve({ ok: false, error: "Resolve error" }),
      ),
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByRole("menuitem", { name: /resolve/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /send back out/i }),
    )
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Resolve error")
    })
  })
})
