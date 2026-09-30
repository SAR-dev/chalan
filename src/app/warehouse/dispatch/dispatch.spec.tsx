// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeRider,
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
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({
    riders: mockRiders,
    currentRider: null,
    warehouseDeliveryRiders: mockRiders,
  }),
  canPickup: () => true,
  canDeliver: () => true,
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({ pickupLocations: [] }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockWarehouse: ReturnType<typeof makeWarehouse> | null
let mockRiders: ReturnType<typeof makeRider>[]
let mockOrdersState: MockOrdersState

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockRiders = [makeRider()]
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const { WarehouseDispatchPageClient } = await import("./dispatch-client")
  renderPage(<WarehouseDispatchPageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse dispatch — section 6", () => {
  it("PICKUP tab shows APPROVED orders with no pickupRiderId", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "APPROVED",
          pickupRiderId: null,
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "APPROVED",
          pickupRiderId: "rider_2",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "IN_WAREHOUSE",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
    expect(screen.queryByText("ORD-0003")).not.toBeInTheDocument()
  })

  it("DELIVERY tab shows IN_WAREHOUSE orders", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "IN_WAREHOUSE",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "APPROVED",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /delivery/i }))
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it('shows "Assign rider" on PICKUP tab for unassigned APPROVED orders', async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "APPROVED",
          pickupRiderId: null,
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      await screen.findByRole("menuitem", { name: /assign rider/i }),
    ).toBeInTheDocument()
  })

  it('hides "Assign rider" on PICKUP tab when already assigned', async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "APPROVED",
          pickupRiderId: "rider_2",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument()
  })

  it('shows "Assign rider" on DELIVERY tab for IN_WAREHOUSE orders', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_1" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /delivery/i }))
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      await screen.findByRole("menuitem", { name: /assign rider/i }),
    ).toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "APPROVED",
          warehouseId: "wh_1",
          pickupRiderId: null,
        }),
      ],
      isLoading: true,
    })
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
  })

  it("shows empty message per tab", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(
      screen.getByText(/no approved orders ready for pickup/i),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /in pickup/i }))
    expect(
      screen.getByText(/no orders currently in pickup/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /delivery/i }))
    expect(screen.getByText(/nothing ready to dispatch/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole("tab", { name: /dispatched/i })[0])
    expect(screen.getByText(/nothing dispatched/i)).toBeInTheDocument()
  })
})
