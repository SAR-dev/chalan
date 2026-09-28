// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SeededSignIn } from "@/lib/next-mode"
import { LoginForm } from "./login-form"

const push = vi.fn()
const replace = vi.fn()
const login = vi.fn(async () => ({ ok: true, user: { role: "SUPER_ADMIN" } }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({
    login,
    verifyTwoFactor: vi.fn(),
    currentUser: null,
    isReady: true,
  }),
  homeForRole: (role: string) => `/${role}`,
}))

const ACCOUNTS: SeededSignIn[] = [
  { label: "Super admin", email: "admin1@email.com", password: "12qwaszx" },
  { label: "Merchant", email: "merchant1@email.com", password: "12qwaszx" },
]

describe("LoginForm demo-account picker (NEXT_MODE)", () => {
  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    login.mockClear()
  })

  it("hides the picker when the server passes no accounts", () => {
    render(<LoginForm />)
    expect(screen.queryByTestId("login-dev-accounts")).toBeNull()
    expect(screen.queryByTestId("login-dev-account-trigger")).toBeNull()
  })

  it("hides the picker for an empty account list", () => {
    render(<LoginForm seededSignIns={[]} />)
    expect(screen.queryByTestId("login-dev-accounts")).toBeNull()
  })

  it("renders one option per seeded account when enabled", async () => {
    const user = userEvent.setup()
    render(<LoginForm seededSignIns={ACCOUNTS} />)
    expect(screen.getByTestId("login-dev-accounts")).toBeInTheDocument()
    expect(screen.getByTestId("login-dev-account-trigger")).toBeInTheDocument()

    // Base UI keeps the options in a portal, so they exist once opened.
    await user.click(screen.getByTestId("login-dev-account-trigger"))
    expect(
      await screen.findByTestId("login-dev-account-admin1@email.com"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("login-dev-account-merchant1@email.com"),
    ).toBeInTheDocument()
  })

  it("fills email and password from the picked account", async () => {
    const user = userEvent.setup()
    render(<LoginForm seededSignIns={ACCOUNTS} />)

    await user.click(screen.getByTestId("login-dev-account-trigger"))
    await user.click(
      screen.getByTestId("login-dev-account-merchant1@email.com"),
    )

    await waitFor(() => {
      expect(screen.getByTestId("login-email")).toHaveValue(
        "merchant1@email.com",
      )
      expect(screen.getByTestId("login-password")).toHaveValue("12qwaszx")
    })
  })

  it("signs in as the picked account without retyping anything", async () => {
    const user = userEvent.setup()
    render(<LoginForm seededSignIns={ACCOUNTS} />)

    await user.click(screen.getByTestId("login-dev-account-trigger"))
    await user.click(screen.getByTestId("login-dev-account-admin1@email.com"))
    await user.click(screen.getByTestId("login-submit"))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("admin1@email.com", "12qwaszx")
    })
  })
})
