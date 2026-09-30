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

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockOrdersState = createMockOrders()
})

async function importPage() {
  const { IntakePageClient } = await import("./intake-client")
  return renderPage(<IntakePageClient initialData={[]} initialTotal={0} />)
}

describe("Warehouse intake — section 4", () => {
  it("INCOMING tab shows only PICKED_UP orders", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "PICKED_UP",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "IN_WAREHOUSE",
          warehouseId: "wh_1",
        }),
      ],
    })
    await importPage()
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it("RECEIVED tab filters by warehouseId", async () => {
    mockOrdersState = createMockOrders({
      orders: [
        makeOrder({
          status: "IN_WAREHOUSE",
          warehouseId: "wh_1",
        }),
        makeOrder({
          status: "IN_WAREHOUSE",
          warehouseId: "wh_2",
        }),
      ],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /received/i }))
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.queryByText("ORD-0002")).not.toBeInTheDocument()
  })

  it('shows "Receive" button for PICKED_UP orders on INCOMING tab', async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PICKED_UP" })],
    })
    await importPage()
    expect(screen.getByRole("button", { name: /receive/i })).toBeInTheDocument()
  })

  it("hides Receive button on RECEIVED tab", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "IN_WAREHOUSE" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /received/i }))
    expect(
      screen.queryByRole("button", { name: /receive/i }),
    ).not.toBeInTheDocument()
  })

  it("shows empty message on INCOMING tab when no PICKED_UP orders", async () => {
    mockOrdersState = createMockOrders({ orders: [] })
    await importPage()
    expect(screen.getByText(/no parcels incoming/i)).toBeInTheDocument()
  })

  it("renders empty on RECEIVED tab when currentWarehouse is null", async () => {
    mockWarehouse = null
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "IN_WAREHOUSE" })],
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /received/i }))
    expect(screen.getByText(/nothing received/i)).toBeInTheDocument()
  })

  it("keeps rows on screen while refreshing", async () => {
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PICKED_UP" })],
      isLoading: true,
    })
    await importPage()
    // A refresh must not read as data loss: the row stays put and the table is
    // marked busy rather than blanking to skeletons.
    expect(screen.getByText("ORD-0001")).toBeInTheDocument()
    expect(screen.getByText("Refreshing…")).toBeInTheDocument()
  })

  it("falls back to skeleton rows on a first load with no data", async () => {
    mockOrdersState = createMockOrders({ orders: [], isLoading: true })
    const { container } = await importPage()
    // Nothing to keep, so skeletons stand in — and "no parcels" must not claim
    // the queue is genuinely empty while the first load is still running.
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/no parcels incoming/i)).not.toBeInTheDocument()
  })

  it("opens Receive dialog and submits successfully", async () => {
    const receiveFn = vi.fn(() => Promise.resolve({ ok: true }))
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PICKED_UP" })],
      receiveOrderAtWarehouse: receiveFn,
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /receive/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /receive parcel/i }),
    )
    expect(receiveFn).toHaveBeenCalled()
  })

  it("shows error toast when Receive fails", async () => {
    const { toast } = await import("sonner")
    mockOrdersState = createMockOrders({
      orders: [makeOrder({ status: "PICKED_UP" })],
      receiveOrderAtWarehouse: vi.fn(() =>
        Promise.resolve({ ok: false, error: "Warehouse error" }),
      ),
    })
    await importPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /receive/i }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /receive parcel/i }),
    )
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Warehouse error")
    })
  })
})
