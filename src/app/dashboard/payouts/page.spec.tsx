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
vi.mock("@/features/payouts/hooks/use-payouts", () => ({
  usePayouts: () => ({
    payoutRequests: [],
    allPayoutRequests: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    statuses: ["PENDING"],
    setStatuses: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    onSortChange: vi.fn(),
    isLoading: false,
    approvePayout: vi.fn(),
    approvePayouts: vi.fn().mockResolvedValue({ ok: true }),
    rejectPayout: vi.fn(),
    rejectPayouts: vi.fn().mockResolvedValue({ ok: true }),
    markPayoutPaid: vi.fn(),
    markPayoutsPaid: vi.fn(),
  }),
}))
vi.mock("@/features/payouts/hooks/use-payout-request-columns", () => ({
  usePayoutRequestColumns: () => [],
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const { PayoutsPageClient } = await import("./payouts-client")
  renderPage(
    <PayoutsPageClient
      initialData={[]}
      initialTotal={0}
      initialCounts={{
        pending: 0,
        approved: 0,
        paid: 0,
        rejected: 0,
      }}
    />,
  )
}

describe("Dashboard payouts page", () => {
  it("renders payout management", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /payout/i })).toBeInTheDocument()
  })
})
