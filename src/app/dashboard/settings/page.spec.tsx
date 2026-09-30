// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage } from "@/app/__tests__/test-utils"

let mockIsLoading = true
let mockConfig: { refundOnCancel?: boolean } | null = null

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/features/platform-config/hooks/use-platform-config", () => ({
  usePlatformConfig: () => ({
    config: mockConfig,
    isLoading: mockIsLoading,
    updatePlatformConfig: vi.fn(async () => ({ ok: true })),
  }),
}))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: makeUser() }),
}))

beforeEach(() => {
  mockIsLoading = true
  mockConfig = null
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch
})

async function importPage() {
  const Page = (await import("./page")).default
  return Page
}

describe("DashboardSettingsPage loading", () => {
  it("keeps the page on screen while the config loads instead of blanking", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    // The regression this guards: the page used to `return null` until
    // `/api/platform-config` resolved, so a slow or failing request left the
    // whole route blank with no header and no explanation.
    expect(screen.getByText("Platform settings")).toBeInTheDocument()
    expect(screen.getByTestId("cancellation-policy-card")).toBeInTheDocument()
  })

  it("withholds the switch rather than showing a policy the server may not hold", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    // `refundOnCancel` is optimistically `true` before the fetch resolves, so
    // rendering it would display a policy that may not be the stored one.
    expect(
      screen.getByTestId("cancellation-policy-loading"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("refund-on-cancel-switch"),
    ).not.toBeInTheDocument()
  })

  it("disables saving until the value it would write has been read", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    const save = screen.getByTestId("save-policy")
    expect(save).toBeDisabled()
  })

  it("swaps in the real switch once the config arrives", async () => {
    mockIsLoading = false
    mockConfig = { refundOnCancel: false }
    const Page = await importPage()
    renderPage(<Page />)

    const toggle = screen.getByTestId("refund-on-cancel-switch")
    expect(toggle).toBeInTheDocument()
    expect(
      screen.queryByTestId("cancellation-policy-loading"),
    ).not.toBeInTheDocument()
    // The value shown is the one that came back, not the optimistic default.
    expect(toggle).toHaveAttribute("aria-checked", "false")
    await waitFor(() => expect(screen.getByTestId("save-policy")).toBeEnabled())
  })

  it("saves after loading", async () => {
    mockIsLoading = false
    mockConfig = { refundOnCancel: true }
    const user = userEvent.setup()
    const Page = await importPage()
    renderPage(<Page />)

    const toggle = screen.getByTestId("refund-on-cancel-switch")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
    await user.click(screen.getByTestId("save-policy"))
    expect(toggle).toBeInTheDocument()
  })
})
