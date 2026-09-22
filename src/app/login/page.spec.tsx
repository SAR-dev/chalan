// @vitest-environment jsdom

import { screen } from "@testing-library/react"
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
})
