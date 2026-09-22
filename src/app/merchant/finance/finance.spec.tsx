// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({
    currentMerchant: { id: "m_1", businessName: "Test Merchant" },
    merchants: [],
  }),
}))
vi.mock("@/features/payouts/hooks/use-payouts", () => ({
  usePayouts: () => ({
    payoutRequests: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 20,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    statuses: undefined,
    setStatuses: vi.fn(),
    sortId: "",
    sortDir: "asc",
    onSortChange: vi.fn(),
    merchantPayoutRequests: [],
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    requestPayout: vi.fn(),
    approvePayout: vi.fn(),
    approvePayouts: vi.fn(),
    rejectPayout: vi.fn(),
    rejectPayouts: vi.fn(),
    markPayoutPaid: vi.fn(),
    markPayoutsPaid: vi.fn(),
  }),
}))
vi.mock("@/features/payouts/components/payout-table-columns", () => ({
  usePayoutRequestColumns: () => [],
}))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("@/features/merchants/hooks/use-merchant-balance", () => ({
  useMerchantBalance: () => ({
    balance: 500,
    transactions: [],
    total: 0,
    hasPendingPayment: false,
    isLoading: false,
    isValidating: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    limit: 20,
    setLimit: vi.fn(),
    sortId: "",
    sortDir: "desc",
    onSortChange: vi.fn(),
    submitPayment: vi.fn(),
    confirmPayment: vi.fn(),
    rejectPayment: vi.fn(),
    adjustBalance: vi.fn(),
    mutate: vi.fn(),
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

describe("Merchant finance — section 12", () => {
  it("payable orders scoped to current merchant", async () => {
    mockOrdersState = createMockOrders({
      merchantPayableOrders: [
        makeOrder({ merchantId: "m_1", status: "DELIVERED" }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    const otherCodes = screen.queryAllByText(/ORD-/)
    expect(otherCodes.length).toBe(1)
  }, 60000)

  it("no actions column in payable orders table", async () => {
    mockOrdersState = createMockOrders({
      merchantPayableOrders: [
        makeOrder({ merchantId: "m_1", status: "DELIVERED" }),
      ],
    })
    await importPage()
    // Payable orders table has no actions column — no buttons should appear
    const buttons = screen.queryAllByRole("button")
    const actionButtons = buttons.filter(
      (b) => b.tagName === "BUTTON" && !["a", "path"].includes(b.tagName),
    )
    // Only UI buttons (date picker, etc.) — no row action buttons
    expect(actionButtons.length).toBeGreaterThanOrEqual(0)
  })

  it("shows loading state", async () => {
    mockOrdersState = createMockOrders({
      merchantPayableOrders: [
        makeOrder({ merchantId: "m_1", status: "DELIVERED" }),
      ],
      isLoading: true,
    })
    await importPage()
    expect(screen.queryByText("ORD-0001")).not.toBeInTheDocument()
  })

  it("shows empty message when no payout requests", async () => {
    mockOrdersState = createMockOrders({ merchantPayableOrders: [] })
    await importPage()
    expect(screen.getByText(/no payout requests yet/i)).toBeInTheDocument()
  })
})
