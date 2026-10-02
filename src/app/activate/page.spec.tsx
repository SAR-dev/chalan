// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ActivatePage from "./page"

const push = vi.fn()
const signOut = vi.fn(async () => ({ data: { success: true } }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("token=e2e-token"),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: () => signOut() },
}))

async function fillAndSubmit() {
  const user = userEvent.setup()
  render(<ActivatePage />)
  await user.type(screen.getByTestId("activate-password"), "Brand-New1!")
  await user.type(screen.getByTestId("activate-confirm"), "Brand-New1!")
  await user.click(screen.getByTestId("activate-submit"))
}

describe("/activate", () => {
  beforeEach(() => {
    push.mockClear()
    signOut.mockClear()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("signs out any existing session before showing the confirmation", async () => {
    await fillAndSubmit()

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1)
    })
    expect(push).toHaveBeenCalledWith("/activated")
    // Sign-out must complete before the navigation, not race it.
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0],
    )
  })

  it("still shows the confirmation when there is no session to drop", async () => {
    signOut.mockRejectedValueOnce(new Error("no session"))
    await fillAndSubmit()

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/activated")
    })
  })

  // Below `lg` this screen has no brand panel at all, so the lockup is the
  // only logo the page has at any width - hence `hideOnLarge={false}`.
  // Asserted by DOM containment, so it holds at any viewport.
  it("places the mobile brand inside the card, not above it", () => {
    render(<ActivatePage />)

    const brand = screen.getByTestId("auth-card-brand")
    const card = brand.closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card?.contains(brand)).toBe(true)
    // Still present from `lg` up, where this page has no other brand.
    expect(brand.className).not.toContain("lg:hidden")
  })

  it("keeps the visitor on the form when activation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Activation link is invalid." }),
      })),
    )
    const user = userEvent.setup()
    render(<ActivatePage />)
    await user.type(screen.getByTestId("activate-password"), "Brand-New1!")
    await user.type(screen.getByTestId("activate-confirm"), "Brand-New1!")
    await user.click(screen.getByTestId("activate-submit"))

    await waitFor(() => {
      expect(screen.getByTestId("activate-error")).toHaveTextContent(/invalid/i)
    })
    expect(signOut).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
