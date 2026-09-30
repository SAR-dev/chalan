// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"
import { SupportPageClient } from "@/features/support/components/support-page-client"

let mockUser = makeUser({ role: "MERCHANT" })

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))

vi.mock("@/features/support/hooks/use-support", () => ({
  useSupport: () => ({
    tickets: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    statuses: undefined,
    setStatuses: vi.fn(),
    sortId: "created",
    sortDir: "desc" as const,
    onSortChange: vi.fn(),
    isLoading: false,
    isRefreshing: false,
    closeTicket: vi.fn(),
    mutate: vi.fn(),
  }),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderSupportPage(isAdmin: boolean) {
  renderPage(
    <SupportPageClient isAdmin={isAdmin} initialData={[]} initialTotal={0} />,
  )
}

describe("SupportPageClient — reference wiring", () => {
  beforeEach(() => {
    resetIds()
    mockUser = makeUser({ role: "MERCHANT" })
  })

  it("gives merchants the standing reference", () => {
    renderSupportPage(false)
    expect(screen.getByTestId("support-reference")).toBeInTheDocument()
  })

  it("does not give the admin queue the merchant reference", () => {
    // The admin support page is a triage queue. A "how fees work" explainer
    // there is noise, and the pricing is not theirs to configure.
    mockUser = makeUser({ role: "SUPER_ADMIN" })
    renderSupportPage(true)
    expect(screen.queryByTestId("support-reference")).not.toBeInTheDocument()
  })

  it("does not give warehouse or rider shells the merchant reference", () => {
    for (const role of ["WAREHOUSE_ADMIN", "RIDER"] as const) {
      resetIds()
      mockUser = makeUser({ role })
      const { unmount } = renderPage(
        <SupportPageClient isAdmin={false} initialData={[]} initialTotal={0} />,
      )
      expect(screen.queryByTestId("support-reference")).not.toBeInTheDocument()
      unmount()
    }
  })
})
