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
  // Record only when a queue is passed: the page's order dialogs also call
  // `useOrders()` with no arguments, and those would overwrite the value.
  useOrders: (opts?: { queue?: string }) => {
    if (opts?.queue) receivedQueue = opts.queue
    return mockOrdersState
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockRider: ReturnType<typeof makeRider> | null
let mockOrdersState: MockOrdersState
/** The queue the page asked the API for. */
let receivedQueue: string | undefined

beforeEach(() => {
  resetIds()
  mockUser = makeUser()
  mockRider = makeRider()
  mockOrdersState = createMockOrders()
  receivedQueue = undefined
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Rider delivery queue", () => {
  // Splitting the queues is the API's job now: it returns only this rider's
  // delivery rows for `?queue=delivery`, so the footer's `total` counts exactly
  // what the table shows (ROADMAP R0.2). The page used to filter a union of
  // both queues client-side while still reporting the union's total —
  // "Showing 1-20 of 137" over four rows, with page 2 showing a different
  // subset, so a rider could think a queue was cleared when it was not.
  it("asks the API for the delivery queue", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    })
    await importPage()
    expect(receivedQueue).toBe("delivery")
  })

  // The page must NOT re-filter. A local `.filter()` here is exactly what
  // made the row count and the footer total disagree — and the API, not this
  // component, is the boundary that decides whose rows may be seen.
  it("renders the API's rows as-is instead of re-filtering them", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" }),
        makeOrder({ deliveryRiderId: "rider_2", status: "IN_TRANSIT" }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
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

  it("keeps rows on screen while refreshing", async () => {
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
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
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
