// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

let mockToken: string | null = "valid-token-123"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? mockToken : null),
  }),
}))

let mockFetchResponse: Response

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve(mockFetchResponse)),
)

beforeEach(() => {
  mockToken = "valid-token-123"
  mockFetchResponse = new Response(null, { status: 200 })
  vi.mocked(fetch).mockClear()
})

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("Reset password page", () => {
  describe("with valid token", () => {
    it("renders password and confirm password inputs", async () => {
      await importPage()
      expect(screen.getByLabelText("New password")).toBeInTheDocument()
      expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /reset password/i }),
      ).toBeInTheDocument()
    })

    it("shows error when passwords do not match", async () => {
      await importPage()
      const user = userEvent.setup()
      await user.type(screen.getByLabelText("New password"), "password123")
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "password456",
      )
      await user.click(screen.getByRole("button", { name: /reset password/i }))
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /passwords do not match/i,
      )
    })

    it("shows error when password is too short", async () => {
      await importPage()
      const user = userEvent.setup()
      await user.type(screen.getByLabelText("New password"), "short")
      await user.type(screen.getByLabelText("Confirm new password"), "short")
      await user.click(screen.getByRole("button", { name: /reset password/i }))
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /at least 8 characters/i,
      )
    })

    it("shows success after successful reset", async () => {
      await importPage()
      const user = userEvent.setup()
      await user.type(screen.getByLabelText("New password"), "newpassword123")
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "newpassword123",
      )
      await user.click(screen.getByRole("button", { name: /reset password/i }))
      expect(
        await screen.findByText(/password has been reset successfully/i),
      ).toBeInTheDocument()
    })

    it("posts to reset-password endpoint with token", async () => {
      await importPage()
      const user = userEvent.setup()
      await user.type(screen.getByLabelText("New password"), "newpassword123")
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "newpassword123",
      )
      await user.click(screen.getByRole("button", { name: /reset password/i }))

      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/reset-password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            newPassword: "newpassword123",
            token: "valid-token-123",
          }),
        }),
      )
    })

    it("shows error when API returns failure", async () => {
      mockFetchResponse = new Response(
        JSON.stringify({ error: { message: "Token expired" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
      await importPage()
      const user = userEvent.setup()
      await user.type(screen.getByLabelText("New password"), "newpassword123")
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "newpassword123",
      )
      await user.click(screen.getByRole("button", { name: /reset password/i }))
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Token expired",
      )
    })
  })

  describe("without token", () => {
    it("shows invalid link heading", async () => {
      mockToken = null
      await importPage()
      expect(
        screen.getByRole("heading", { name: /invalid link/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByText("This password reset link is invalid or has expired."),
      ).toBeInTheDocument()
    })

    it("links to /forgot-password", async () => {
      mockToken = null
      await importPage()
      const link = screen.getByRole("link", {
        name: /request a new reset link/i,
      })
      expect(link).toHaveAttribute("href", "/forgot-password")
    })

    it("does not show password form", async () => {
      mockToken = null
      await importPage()
      expect(screen.queryByLabelText("New password")).not.toBeInTheDocument()
    })
  })
})
