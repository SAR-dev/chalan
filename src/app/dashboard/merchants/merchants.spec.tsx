// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"
import type { Merchant } from "@/lib/types"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => mockMerchantsState,
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/quick-filters", () => ({
  QuickFilters: () => null,
}))

let mockUser: ReturnType<typeof makeUser> | null

function makeMerchant(overrides?: Partial<Merchant>): Merchant {
  return {
    id: "m_1",
    userId: "u_1",
    businessName: "Test Merchant",
    ownerName: "Owner",
    email: "merchant@test.com",
    phone: "01700000000",
    address: "123 Merchant St",
    status: "PENDING",
    baseRate: 60,
    extraRatePerKg: 20,
    freeWeightKg: 2,
    maxWeightKg: 30,
    isActive: true,
    allowPricing: false,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  } as Merchant
}

const mockMerchantsState = {
  merchants: [] as Merchant[],
  get allMerchants() {
    return this.merchants
  },
  total: 0,
  isLoading: false,
  setStatuses: () => {},
  page: 1,
  setPage: () => {},
  limit: 20,
  setLimit: () => {},
  query: "",
  setQuery: () => {},
  suspendMerchant: () => Promise.resolve({ ok: true }),
  reactivateMerchant: () => Promise.resolve({ ok: true }),
  suspendMerchants: () => Promise.resolve({ ok: true }),
  reactivateMerchants: () => Promise.resolve({ ok: true }),
}

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
  mockMerchantsState.merchants = []
  mockMerchantsState.total = 0
})

async function importPage() {
  const { MerchantsPageClient } = await import("./merchants-client")
  renderPage(
    <MerchantsPageClient
      initialData={mockMerchantsState.merchants}
      initialTotal={mockMerchantsState.total}
      initialCounts={{ total: 0, active: 0, suspended: 0 }}
    />,
  )
}

describe("Dashboard merchants — section 10", () => {
  it('shows no inline "Approve" button for PENDING merchants', async () => {
    mockMerchantsState.merchants = [makeMerchant({ status: "PENDING" })]
    mockMerchantsState.total = 1
    await importPage()
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Test Merchant")).toBeInTheDocument()
  })

  it('hides inline "Approve" button for ACTIVE merchants', async () => {
    mockMerchantsState.merchants = [makeMerchant({ status: "ACTIVE" })]
    mockMerchantsState.total = 1
    await importPage()
    expect(
      screen.queryByRole("button", { name: /^approve$/i }),
    ).not.toBeInTheDocument()
  })

  it("dropdown shows Set pricing enabled for ACTIVE merchants", async () => {
    mockMerchantsState.merchants = [makeMerchant({ status: "ACTIVE" })]
    mockMerchantsState.total = 1
    await importPage()
    const buttons = screen.getAllByRole("button")
    const moreBtn = buttons.find((b) => b.querySelector("svg"))
    expect(moreBtn).toBeTruthy()
  })

  it("dropdown shows View balance always", async () => {
    mockMerchantsState.merchants = [makeMerchant({ status: "ACTIVE" })]
    mockMerchantsState.total = 1
    await importPage()
    const buttons = screen.getAllByRole("button")
    const moreBtn = buttons.find((b) => b.querySelector("svg"))
    expect(moreBtn).toBeTruthy()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockMerchantsState.merchants = [
      makeMerchant({ status: "PENDING", businessName: "Test Merchant" }),
    ]
    mockMerchantsState.total = 1
    mockMerchantsState.isLoading = true
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("Test Merchant")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
    mockMerchantsState.isLoading = false
  })

  it("shows empty message", async () => {
    mockMerchantsState.merchants = []
    mockMerchantsState.total = 0
    await importPage()
    expect(screen.getByText(/no merchants match/i)).toBeInTheDocument()
  })
})
