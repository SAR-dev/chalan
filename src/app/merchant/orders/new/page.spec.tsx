// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({
    currentMerchant: {
      id: "m_1",
      businessName: "Test Biz",
      isActive: true,
      status: "ACTIVE",
      baseRate: 60,
      extraRatePerKg: 20,
      freeWeightKg: 2,
      maxWeightKg: 30,
    },
    merchants: [],
    isLoading: false,
  }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({ pickupLocations: [] }),
}))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ createOrder: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "MERCHANT", merchantId: "m_1" })
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Merchant new order page", () => {
  it("renders order creation form", async () => {
    await importPage()
    expect(screen.getByText(/new delivery order/i)).toBeInTheDocument()
  })
})
