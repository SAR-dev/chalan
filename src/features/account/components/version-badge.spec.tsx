// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { VersionBadge } from "./version-badge"

vi.mock("@/features/account/components/app-update-button", () => ({
  AppUpdateButton: () => (
    <button type="button" data-testid="app-update-stub">
      Update
    </button>
  ),
}))

describe("VersionBadge", () => {
  it("shows only the version in the bar", () => {
    render(<VersionBadge version={{ version: "0.1.0", commit: "abc1234" }} />)

    const badge = screen.getByTestId("topnav-version")
    expect(badge).toHaveTextContent("v0.1.0")
    // The commit is detail, not bar content — it lives in the dialog.
    expect(badge).not.toHaveTextContent("abc1234")
  })

  it("reveals the details on click", async () => {
    const user = userEvent.setup()
    render(<VersionBadge version={{ version: "0.1.0", commit: "abc1234" }} />)

    // Nothing before the click: the dialog is closed.
    expect(
      screen.queryByTestId("version-dialog-version"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByTestId("topnav-version"))

    expect(screen.getByTestId("version-dialog-version")).toHaveTextContent(
      "v0.1.0",
    )
    expect(screen.getByTestId("version-dialog-commit")).toHaveTextContent(
      "abc1234",
    )
    expect(screen.getByTestId("app-update-stub")).toBeInTheDocument()
  })

  it("omits the commit row when the build has none", async () => {
    const user = userEvent.setup()
    render(<VersionBadge version={{ version: "0.1.0", commit: null }} />)
    await user.click(screen.getByTestId("topnav-version"))

    expect(screen.getByTestId("version-dialog-version")).toBeInTheDocument()
    expect(
      screen.queryByTestId("version-dialog-commit"),
    ).not.toBeInTheDocument()
  })

  it("renders nothing when no version is passed", () => {
    // A layout that forgets to pass it must not leave an empty chip behind.
    render(<VersionBadge />)
    expect(screen.queryByTestId("topnav-version")).not.toBeInTheDocument()
  })
})
