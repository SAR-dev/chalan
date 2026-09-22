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

describe("Rider delivery queue", () => {
  it("filters by deliveryRiderId — only assigned deliveries appear", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "IN_TRANSIT",
        }),
        makeOrder({
          deliveryRiderId: "rider_2",
          status: "IN_TRANSIT",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it("hides pickup-only orders", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          pickupRiderId: "rider_1",
          deliveryRiderId: null,
          status: "APPROVED",
        }),
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "IN_TRANSIT",
        }),
      ],
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
  })

  it('shows "Start" button for IN_TRANSIT orders assigned to this rider', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    })
    await importPage()
    const buttons = screen.getAllByRole("button", { name: /start/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('hides "Start" button when deliveryRiderId does not match', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ deliveryRiderId: "rider_2", status: "IN_TRANSIT" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument()
  })

  it('shows "Record" button for OUT_FOR_DELIVERY orders assigned to this rider', async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ deliveryRiderId: "rider_1", status: "OUT_FOR_DELIVERY" }),
      ],
    })
    await importPage()
    const buttons = screen.getAllByRole("button", { name: /record/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('hides "Record" button when deliveryRiderId does not match', async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ deliveryRiderId: "rider_2", status: "OUT_FOR_DELIVERY" }),
      ],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /record/i }),
    ).not.toBeInTheDocument()
  })

  it("shows empty message when no deliveries match", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no deliveries waiting/i)).toBeInTheDocument()
  })

  it("renders empty when currentRider is null", async () => {
    mockRider = null
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument()
  })

  it("shows loading state", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "IN_TRANSIT",
        }),
      ],
      isLoading: true,
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
  })

  it("shows empty message when no orders", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no deliveries waiting/i)).toBeInTheDocument()
  })

  it("opens Out for Delivery dialog", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /start/i }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})
