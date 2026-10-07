// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeOrder, renderPage } from "@/app/__tests__/test-utils"
import { WarehouseReceiveDialog } from "./warehouse-receive-dialog"

// The warehouse-receive scan point (`receive`): the toggle comes from the
// scan-policy hook, enforcement is client-side in the dialog, and the
// transition body is identical either way — the same R9 shape as the rider
// dialogs. `receiveOrderAtWarehouse` is mocked (route-tested elsewhere); the
// gate itself is real so manual entry proves the full path.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ receiveOrderAtWarehouse: receiveMock }),
}))
vi.mock("@/features/platform-config/hooks/use-scan-policy", () => ({
  useScanPolicy: () => ({
    warehouseReceiveScanRequired: warehouseReceiveRequiredMock,
  }),
}))

const receiveMock = vi.fn(async () => ({ ok: true }))
let warehouseReceiveRequiredMock = true

beforeEach(() => {
  warehouseReceiveRequiredMock = true
  receiveMock.mockClear()
})

describe("WarehouseReceiveDialog — warehouse-receive scan gate (R9)", () => {
  it("blocks submit until the label is verified while the toggle is on", () => {
    const order = makeOrder()
    renderPage(
      <WarehouseReceiveDialog
        order={order}
        merchantName="Merchant One"
        riderName="Rider One"
        warehouseName="Warehouse One"
        open
        onOpenChange={() => {}}
      />,
    )

    expect(screen.getByTestId("scan-gate")).toBeInTheDocument()
    expect(screen.getByTestId("warehouse-receive-submit")).toBeDisabled()

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: order.id },
    })

    expect(screen.getByTestId("scan-gate-verified")).toHaveTextContent(order.id)
    expect(screen.getByTestId("warehouse-receive-submit")).toBeEnabled()
  })

  it("sends the transition with the order id once verified", async () => {
    const order = makeOrder()
    renderPage(
      <WarehouseReceiveDialog
        order={order}
        merchantName="Merchant One"
        riderName="Rider One"
        warehouseName="Warehouse One"
        open
        onOpenChange={() => {}}
      />,
    )

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: order.id },
    })
    fireEvent.click(screen.getByTestId("warehouse-receive-submit"))

    expect(receiveMock).toHaveBeenCalledWith(order.id)
  })

  it("renders no gate and never blocks when the toggle is off", () => {
    warehouseReceiveRequiredMock = false
    const order = makeOrder()
    renderPage(
      <WarehouseReceiveDialog
        order={order}
        merchantName="Merchant One"
        riderName="Rider One"
        warehouseName="Warehouse One"
        open
        onOpenChange={() => {}}
      />,
    )

    expect(screen.queryByTestId("scan-gate")).not.toBeInTheDocument()
    expect(screen.getByTestId("warehouse-receive-submit")).toBeEnabled()
  })
})
