// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"
import type { MerchantOrderSummary } from "@/lib/types"

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
vi.mock("@/features/orders/hooks/use-order-summary", () => ({
  useOrderSummary: () => ({
    summary: mockSummary,
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh: () => {},
  }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockOrdersState: MockOrdersState
let mockSummary: MerchantOrderSummary

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "MERCHANT", merchantId: "m_1" })
  mockOrdersState = createMockOrders()
  mockSummary = {
    codToCollect: 0,
    inProgressCount: 0,
    codToSettleCount: 0,
    codToSettleAmount: 0,
    payoutReadyCount: 0,
    payoutToIssue: 0,
    deliveredCount: 0,
    totalEarnings: 0,
  }
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
  }, 60000)

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

  // The bug ROADMAP R0.1 fixes: every card used to be `.filter().reduce()`
  // over the visible page of orders, so a merchant with 400 delivered orders
  // was shown the money of their newest 20 and nothing on screen revealed the
  // truncation. The server summary must win even when the page contradicts it.
  it("shows server-computed money, not money derived from the visible page", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          merchantId: "m_1",
          status: "IN_TRANSIT",
          productCost: 2000,
        }),
      ],
    })
    mockSummary = {
      codToCollect: 999_000,
      inProgressCount: 400,
      codToSettleCount: 7,
      codToSettleAmount: 55_000,
      payoutReadyCount: 12,
      payoutToIssue: 88_000,
      deliveredCount: 610,
      totalEarnings: 123_000,
    }

    await importPage()

    // The visible page holds exactly one 2,000 TK order — deriving from it
    // would show "2,000", never "999,000".
    expect(screen.getByText("999,000 TK")).toBeInTheDocument()
    expect(screen.getByText("55,000 TK")).toBeInTheDocument()
    expect(screen.getByText("88,000 TK")).toBeInTheDocument()
    expect(screen.getByText("123,000 TK")).toBeInTheDocument()
    expect(screen.getByText("400 orders in transit")).toBeInTheDocument()
    expect(screen.getByText("610 delivered")).toBeInTheDocument()
    expect(screen.getByText("12 orders ready")).toBeInTheDocument()
    // Tab badges are aggregates too, not page counts.
    expect(screen.getByText("In progress (400)")).toBeInTheDocument()
    expect(screen.getByText("Delivered (610)")).toBeInTheDocument()
    expect(screen.getByText("Payout ready (12)")).toBeInTheDocument()
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
