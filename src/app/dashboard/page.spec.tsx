// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [], total: 0, isLoading: false }),
}))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ orders: [], total: 0, isLoading: false }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [], total: 0, isLoading: false }),
}))
vi.mock("@/features/team/hooks/use-team", () => ({
  useTeam: () => ({ team: [], total: 0, isLoading: false }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [], total: 0, isLoading: false }),
}))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const { OverviewPageClient } = await import("./overview-client")
  renderPage(
    <OverviewPageClient
      userName="Test"
      warehouseAdminCount={0}
      totalWarehouses={0}
      activeWarehouses={0}
      pendingMerchants={0}
      pendingOrders={0}
      pendingRiders={0}
      hasActiveMailConfig={false}
    />,
  )
}

describe("Dashboard overview page", () => {
  it("renders dashboard overview", async () => {
    await importPage()
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
  })
})
