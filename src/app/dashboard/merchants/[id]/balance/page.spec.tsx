// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    use: <T,>(x: T): T => x,
  }
})
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({
    merchants: [] as { id: string; businessName: string }[],
    total: 0,
    isLoading: false,
  }),
}))
vi.mock("@/features/merchants/hooks/use-merchant-balance", () => ({
  useMerchantBalance: () => ({
    balance: { totalDue: 1000, totalPaid: 500 },
    transactions: [],
    page: 1,
    setPage: vi.fn(),
    isLoading: false,
  }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page params={Promise.resolve({ id: "m_1" })} />)
}

describe("Dashboard merchant balance page", () => {
  it("renders balance view", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /merchant balance/i }),
    ).toBeInTheDocument()
  })
})
