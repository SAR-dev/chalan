// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

let mockFetchResponse: Response

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve(mockFetchResponse)),
)

beforeEach(() => {
  mockFetchResponse = new Response(null, { status: 200 })
  vi.mocked(fetch).mockClear()
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Forgot password page", () => {
  it("renders email input and submit button", async () => {
    await importPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /send reset link/i }),
    ).toBeInTheDocument()
  })

  it("shows success message after submitting valid email", async () => {
    await importPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), "alice@test.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    expect(
      await screen.findByText(/you'll receive a password reset email/i),
    ).toBeInTheDocument()
    expect(screen.getByText("alice@test.com")).toBeInTheDocument()
  })

  it("shows error message when API returns error", async () => {
    mockFetchResponse = new Response(
      JSON.stringify({ error: { message: "Rate limited" } }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    )
    await importPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), "bob@test.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited")
  })

  it("shows generic error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))
    await importPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), "carol@test.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /unable to send reset email/i,
    )
  })

  it("includes /login link", async () => {
    await importPage()
    const link = screen.getByRole("link", { name: /back to sign in/i })
    expect(link).toHaveAttribute("href", "/login")
  })

  it("posts to the correct endpoint with redirectTo", async () => {
    await importPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), "dave@test.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/request-password-reset"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("dave@test.com"),
      }),
    )
  })
})
