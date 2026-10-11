// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccountSettings } from "./account-settings"

// The component talks to exactly one hook, so mocking that plus the two-factor
// panel (which pulls its own auth client) is enough to render the whole page.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    currentUser: {
      id: "u1",
      name: "Rider One",
      email: "rider1@email.com",
      phone: "01700000000",
      role: "RIDER",
      tableRowsPerPage: 25,
    },
    updateProfileName: vi.fn(),
    updateProfileImage: vi.fn(),
    updateProfilePhone: vi.fn(),
    changePassword: vi.fn(),
    updateTableRowsPerPage: vi.fn(),
    refreshUser: vi.fn(),
  },
}))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}))

vi.mock("@/features/account/components/two-factor-settings", () => ({
  TwoFactorSettings: () => <div data-testid="two-factor" />,
}))

vi.mock("@/lib/auth-client", () => ({ authClient: {} }))

async function openPreferences() {
  const user = userEvent.setup()
  render(<AccountSettings version={{ version: "0.1.0", commit: "abc1234" }} />)
  await user.click(screen.getByRole("tab", { name: "Preferences" }))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AccountSettings build version", () => {
  it("shows the running version and commit on the Preferences tab", async () => {
    await openPreferences()

    expect(screen.getByTestId("account-build")).toBeInTheDocument()
    expect(screen.getByTestId("account-build-version")).toHaveTextContent(
      "v0.1.0",
    )
    expect(screen.getByTestId("account-build-version")).toHaveTextContent(
      "abc1234",
    )
  })

  it("omits the separator when the build has no commit", async () => {
    render(<AccountSettings version={{ version: "0.1.0", commit: null }} />)
    await userEvent.click(screen.getByRole("tab", { name: "Preferences" }))

    const label = screen.getByTestId("account-build-version")
    expect(label).toHaveTextContent("v0.1.0")
    expect(label.textContent).toBe("v0.1.0")
  })

  it("renders no Build card when no version is passed", async () => {
    // A caller that forgets the prop should degrade to the old page, not to an
    // empty card.
    render(<AccountSettings />)
    await userEvent.click(screen.getByRole("tab", { name: "Preferences" }))

    expect(screen.queryByTestId("account-build")).not.toBeInTheDocument()
  })

  it("keeps the version out of the other tabs", async () => {
    const user = userEvent.setup()
    render(
      <AccountSettings version={{ version: "0.1.0", commit: "abc1234" }} />,
    )

    expect(screen.queryByTestId("account-build")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Profile" }))
    expect(screen.queryByTestId("account-build")).not.toBeInTheDocument()
  })
})
