// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockOrdersState: ReturnType<typeof createMockOrders>

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const { OrdersPageClient } = await import("./orders-client")
  renderPage(
    <OrdersPageClient
      initialData={mockOrdersState.orders}
      initialTotal={mockOrdersState.total}
      initialCounts={{ pending: 0, approved: 0, inProgress: 0, total: 0 }}
    />,
  )
}

describe("Dashboard orders — section 9", () => {
  it("shows all orders without client-side scope filtering", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({ status: "PENDING" }),
        makeOrder({ status: "APPROVED" }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("ORD-0002")).toBeInTheDocument()
  })

  it('shows "Review order" for PENDING orders', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(await screen.findByText(/review order/i)).toBeInTheDocument()
  })

  it('hides "Review order" for non-PENDING orders', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "APPROVED" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(screen.queryByText(/review order/i)).not.toBeInTheDocument()
  })

  it('shows "Cancel order" for cancellable statuses', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PENDING" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(await screen.findByText(/cancel order/i)).toBeInTheDocument()
  })

  it('hides "Cancel order" for non-cancellable statuses', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "DELIVERED" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(screen.queryByText(/cancel order/i)).not.toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PENDING" })],
      isLoading: true,
    })
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
  })

  it("shows empty message", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no orders match/i)).toBeInTheDocument()
  })

  it("opens Cancel dialog from actions dropdown and submits", async () => {
    const cancelFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PENDING" })],
      cancelOrder: cancelFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByText(/cancel order/i))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /cancel order/i }),
    )
    expect(cancelFn).toHaveBeenCalled()
  })
})
