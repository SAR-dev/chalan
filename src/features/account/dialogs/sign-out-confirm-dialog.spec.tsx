// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import { SignOutConfirmDialog } from "./sign-out-confirm-dialog"

const logout = vi.fn(async () => {})

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: { id: "U1", name: "Admin" }, logout }),
}))

function renderDialog(onOpenChange: (o: boolean) => void = () => {}) {
  return renderPage(<SignOutConfirmDialog open onOpenChange={onOpenChange} />)
}

beforeEach(() => {
  logout.mockClear()
  vi.mocked(toast.error).mockClear()
})

describe("SignOutConfirmDialog", () => {
  it("asks before ending the session", () => {
    renderDialog()
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument()
    expect(screen.getByText("Sign out?")).toBeInTheDocument()
    // The wording matters: this dialog is the only thing between a stray
    // click and having to retype credentials.
    expect(screen.getByText(/sign in again/i)).toBeInTheDocument()
    expect(screen.getByTestId("confirm-button")).toHaveTextContent("Sign out")
  })

  it("does not sign out on cancel", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    await user.click(screen.getByTestId("cancel-button"))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The guarantee the requirement asks for: cancel is a genuine no-op, not
    // a sign-out that gets interrupted halfway.
    expect(logout).not.toHaveBeenCalled()
  })

  it("holds the action open with a loading state until sign-out resolves", async () => {
    const user = userEvent.setup()
    let resolve: (() => void) | undefined
    logout.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    renderDialog()

    await user.click(screen.getByTestId("confirm-button"))

    // Both controls are locked for the duration — a second confirm would fire
    // a second sign-out and cancel mid-flight would lie about what happened.
    await waitFor(() =>
      expect(screen.getByTestId("confirm-button")).toBeDisabled(),
    )
    expect(screen.getByTestId("cancel-button")).toBeDisabled()
    expect(logout).toHaveBeenCalledTimes(1)

    resolve?.()
    await waitFor(() =>
      expect(screen.getByTestId("confirm-button")).toBeEnabled(),
    )
  })

  it("recovers if sign-out rejects, rather than wedging the dialog", async () => {
    const user = userEvent.setup()
    logout.mockRejectedValueOnce(new Error("network down"))
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    await user.click(screen.getByTestId("confirm-button"))

    // Both buttons come back so the user can retry.
    await waitFor(() =>
      expect(screen.getByTestId("confirm-button")).toBeEnabled(),
    )
    // And the dialog stays open: closing it on failure would strand the user
    // with no explanation and no obvious way to try again.
    expect(onOpenChange).not.toHaveBeenCalled()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
