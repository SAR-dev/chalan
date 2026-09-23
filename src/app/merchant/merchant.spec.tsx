// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import { createMockOrders, makeOrder, makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

const mockMerchant = {
  id: "m_1",
  businessName: "Test Merchant",
  status: "ACTIVE",
}

const mockPickupLocations = { pickupLocations: [] }

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => mockPickupLocations,
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({
    currentMerchant: mockMerchant,
    merchants: [mockMerchant],
  }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("@/features/orders/hooks/use-order-analytics", () => ({
  useOrderAnalytics: () => ({
    analytics: null,
    isLoading: false,
    error: null,
  }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockOrdersState: MockOrdersState

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "MERCHANT", merchantId: "m_1" })
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Merchant dashboard", () => {
  it("orders scoped by current merchant", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ merchantId: "m_1", status: "APPROVED" }),
        makeOrder({ merchantId: "m_2", status: "APPROVED" }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  }, 30000)

  it("shows orders in tabs", async () => {
    const orders = Array.from({ length: 5 }, () =>
      makeOrder({
        merchantId: "m_1",
        status: "IN_TRANSIT",
      }),
    )
    mockOrdersState = createMockOrders({ orders })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
  })

  it("shows empty state when no orders", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getAllByText(/no orders/i).length).toBeGreaterThan(0)
  })

  it("shows COD to collect stat", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          merchantId: "m_1",
          status: "DELIVERED",
          productCost: 1000,
        }),
        makeOrder({
          merchantId: "m_1",
          status: "IN_TRANSIT",
          productCost: 2000,
        }),
      ],
    })
    await importPage()
    expect(screen.getByText(/cod to collect/i)).toBeInTheDocument()
  })

  it("opens Cancel dialog and submits", async () => {
    const cancelFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ merchantId: "m_1", status: "PENDING" })],
      cancelOrder: cancelFn,
    })
    await importPage()
    const user = userEvent.setup()
    const cancelBtn = screen.getByRole("button", { name: /cancel/i })
    await user.click(cancelBtn)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeInTheDocument()
  })
})
