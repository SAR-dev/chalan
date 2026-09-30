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
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({
    currentRider: mockRider,
    riders: mockRider ? [mockRider] : [],
  }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({ pickupLocations: [] }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockRider: ReturnType<typeof makeRider> | null
let mockOrdersState: MockOrdersState

beforeEach(() => {
  resetIds()
  mockUser = makeUser()
  mockRider = makeRider()
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Rider pickup queue", () => {
  it("filters by pickupRiderId — only assigned pickups appear", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
        }),
        makeOrder({
          pickupRiderId: "rider_2",
          status: "APPROVED",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it("hides delivery-only orders", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          deliveryRiderId: "rider_1",
          pickupRiderId: null,
          status: "IN_TRANSIT",
        }),
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
        }),
      ],
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
  })

  it('shows "Picked up" button for APPROVED orders assigned to this rider', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    })
    await importPage()
    const buttons = screen.getAllByRole("button", { name: /picked up/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('hides "Picked up" button when pickupRiderId does not match', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_2", status: "APPROVED" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /picked up/i }),
    ).not.toBeInTheDocument()
  })

  it('hides "Picked up" button when status is not APPROVED', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_1", status: "PICKED_UP" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /picked up/i }),
    ).not.toBeInTheDocument()
  })

  it("shows empty message when no pickups match", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no pickups waiting/i)).toBeInTheDocument()
  })

  it("renders empty when currentRider is null", async () => {
    mockRider = null
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /picked up/i }),
    ).not.toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
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

  it("shows empty message when no orders", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no pickups waiting/i)).toBeInTheDocument()
  })

  it("opens Pickup dialog", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /picked up/i }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})
