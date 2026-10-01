// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

const mockLogin = vi.fn()
let mockCurrentUser: ReturnType<typeof makeUser> | null
let mockIsReady = false

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({
    login: mockLogin,
    currentUser: mockCurrentUser,
    isReady: mockIsReady,
  }),
  homeForRole: (r: string) => (r === "MERCHANT" ? "/merchant" : "/dashboard"),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  resetIds()
  mockCurrentUser = null
  mockIsReady = false
  mockLogin.mockReset()
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Login page", () => {
  it("renders login form", async () => {
    await importPage()
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  // Below `lg` the brand panel is hidden, so the logo has to reappear. It
  // lives inside the bordered card (not floating above it) so a phone shows
  // one framed box. Asserted by DOM containment, so it holds at any viewport.
  it("places the mobile brand inside the card, not above it", async () => {
    await importPage()
    const brand = screen.getByTestId("auth-card-brand")
    const card = brand.closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card?.contains(brand)).toBe(true)
    expect(brand.className).toContain("lg:hidden")
  })

  // The 2FA step swaps the card body; the brand must survive that swap.
  it("keeps the in-card brand on the two-factor step", async () => {
    mockIsReady = true
    mockLogin.mockResolvedValue({ ok: false, needsTwoFactor: true })
    await importPage()

    const user = userEvent.setup()
    await user.type(screen.getByTestId("login-email"), "a@b.com")
    await user.type(screen.getByTestId("login-password"), "pw")
    await user.click(screen.getByTestId("login-submit"))
    await screen.findByTestId("two-factor-login-input")

    const brand = screen.getByTestId("auth-card-brand")
    expect(brand.closest('[data-slot="card"]')?.contains(brand)).toBe(true)
  })
})
