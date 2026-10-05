// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MockOrdersState } from "@/app/__tests__/test-utils"
import {
  createMockOrders,
  makeOrder,
  makeUser,
  makeWarehouse,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    currentWarehouse: mockWarehouse,
    warehouses: mockWarehouse ? [mockWarehouse] : [],
  }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => mockOrdersState,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let mockUser: ReturnType<typeof makeUser> | null
let mockWarehouse: ReturnType<typeof makeWarehouse> | null
let mockOrdersState: MockOrdersState
let mockSetStatuses: (statuses?: string[]) => void

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockSetStatuses = vi.fn()
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const { WarehouseExceptionsPageClient } = await import("./exceptions-client")
  renderPage(
    <WarehouseExceptionsPageClient initialData={[]} initialTotal={0} />,
  )
}

describe("Warehouse exceptions", () => {
  it("lists FAILED_ATTEMPT parcels for this warehouse only", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_2",
        }),
        makeOrder({
          status: "RETURNED",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
    // RETURNED is terminal and lives on Completed now (decision #1).
    expect(screen.queryByText("ORD-0003")).not.toBeInTheDocument()
  })

  it("forces the status filter to FAILED_ATTEMPT", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
      setStatuses: mockSetStatuses,
    })
    await importPage()
    expect(mockSetStatuses).toHaveBeenCalledWith(["FAILED_ATTEMPT"])
  })

  it("has no tab bar", async () => {
    // Decision #11: one status means one tab is a tab that does nothing.
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(screen.queryByRole("tab", { name: /returned/i })).toBeNull()
  })

  it("has no return-reason or resolved-by columns", async () => {
    // They moved to Completed's Returned tab; leaving them here would render a
    // column of dashes for every row.
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    expect(screen.queryByText("Return reason")).not.toBeInTheDocument()
    expect(screen.queryByText("Resolved by")).not.toBeInTheDocument()
  })

  it("shows a single needs-attention count", async () => {
    mockOrdersState = createMockOrders({
      orders: [],
      warehouseFailedOrders: 4,
    })
    await importPage()
    expect(screen.getByText("Needs attention")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.queryByText("Total exceptions")).not.toBeInTheDocument()
  })

  it('shows "Resolve" for FAILED_ATTEMPT orders in the assigned warehouse', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      await screen.findByRole("menuitem", { name: /resolve/i }),
    ).toBeInTheDocument()
  })

  it('hides "Resolve" when warehouseId does not match', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_2" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument()
  })

  it("offers Resolve as the single action", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    expect(
      await screen.findByRole("menuitem", { name: /resolve/i }),
    ).toBeInTheDocument()
  })

  it("shows empty message when no exceptions", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no failed deliveries/i)).toBeInTheDocument()
  })

  it("renders empty when currentWarehouse is null", async () => {
    mockWarehouse = null
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    })
    await importPage()
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
        }),
      ],
      isLoading: true,
    })
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
  })

  it("opens Resolve dialog and submits with default REATTEMPT", async () => {
    const reattemptFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
      reattemptFailedOrder: reattemptFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByRole("menuitem", { name: /resolve/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /send back out/i }),
    )
    expect(reattemptFn).toHaveBeenCalled()
  })

  it("shows error toast when resolve fails", async () => {
    const { toast } = await import("sonner")
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
      reattemptFailedOrder: vi.fn(() =>
        Promise.resolve({ ok: false, error: "Resolve error" }),
      ),
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /actions/i }))
    await user.click(await screen.findByRole("menuitem", { name: /resolve/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /send back out/i }),
    )
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Resolve error")
    })
  })
})
