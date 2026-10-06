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
const mockPickupLocations = { pickupLocations: [] }
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => mockPickupLocations,
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

describe("Rider dashboard", () => {
  it("pickup table scoped by pickupRiderId", async () => {
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
  }, 30000)

  it("delivery table scoped by deliveryRiderId", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "OUT_FOR_DELIVERY",
        }),
        makeOrder({
          deliveryRiderId: "rider_2",
          status: "OUT_FOR_DELIVERY",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it('shows "Out for pickup" then "Picked up" across the pickup leg', async () => {
    // Two states, two buttons: an APPROVED parcel can only be started, and an
    // OUT_FOR_PICKUP one can only be collected. Showing both at once would be
    // an invitation to hit the server's 400.
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          id: "ORD-0001",
          pickupRiderId: "rider_1",
          status: "APPROVED",
        }),
        makeOrder({
          id: "ORD-0002",
          pickupRiderId: "rider_1",
          status: "OUT_FOR_PICKUP",
        }),
      ],
    })
    await importPage()
    expect(
      screen.getAllByRole("button", { name: /out for pickup/i }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByRole("button", { name: /picked up/i }).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('shows "Record" button in delivery table', async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ deliveryRiderId: "rider_1", status: "OUT_FOR_DELIVERY" }),
      ],
    })
    await importPage()
    const buttons = screen.getAllByRole("button", { name: /record/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it("shows stat cards", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" }),
        makeOrder({ deliveryRiderId: "rider_1", status: "OUT_FOR_DELIVERY" }),
      ],
    })
    await importPage()
    expect(screen.getByText(/pickup progress/i)).toBeInTheDocument()
    expect(screen.getByText(/delivery progress/i)).toBeInTheDocument()
    expect(screen.getByText(/cash to submit/i)).toBeInTheDocument()
  })

  it("shows empty state when no tasks", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it("shows orders as cards", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
  })

  it("opens Pickup dialog", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ pickupRiderId: "rider_1", status: "OUT_FOR_PICKUP" }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /picked up/i }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("opens the out-for-pickup dialog instead", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /out for pickup/i }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})
