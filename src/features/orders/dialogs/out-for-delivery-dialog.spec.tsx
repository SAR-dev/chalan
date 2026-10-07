// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeOrder, renderPage } from "@/app/__tests__/test-utils"
import { OutForDeliveryDialog } from "./out-for-delivery-dialog"

// The warehouse-handoff scan point (`out-for-delivery`): the toggle comes from
// the rider scan-policy hook, enforcement is client-side in the dialog, and the
// transition body is identical either way — exactly the R9 shape the pickup and
// delivery dialogs already use. `markOutForDelivery` is mocked (route-tested
// elsewhere); the gate itself is real so manual entry proves the full path.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ markOutForDelivery: markOutForDeliveryMock }),
}))
vi.mock("@/features/platform-config/hooks/use-scan-policy", () => ({
  useScanPolicy: () => ({ warehouseScanRequired: warehouseScanRequiredMock }),
}))

const markOutForDeliveryMock = vi.fn(async () => ({ ok: true }))
let warehouseScanRequiredMock = true

beforeEach(() => {
  warehouseScanRequiredMock = true
  markOutForDeliveryMock.mockClear()
})

describe("OutForDeliveryDialog — warehouse-handoff scan gate (R9)", () => {
  it("blocks submit until the label is verified while the toggle is on", async () => {
    const order = makeOrder()
    renderPage(
      <OutForDeliveryDialog order={order} open onOpenChange={() => {}} />,
    )

    expect(screen.getByTestId("scan-gate")).toBeInTheDocument()
    expect(screen.getByTestId("out-for-delivery-submit")).toBeDisabled()

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: order.id },
    })

    expect(screen.getByTestId("scan-gate-verified")).toHaveTextContent(order.id)
    expect(screen.getByTestId("out-for-delivery-submit")).toBeEnabled()
  })

  it("sends the transition with the order id once verified", async () => {
    const order = makeOrder()
    renderPage(
      <OutForDeliveryDialog order={order} open onOpenChange={() => {}} />,
    )

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: order.id },
    })
    fireEvent.click(screen.getByTestId("out-for-delivery-submit"))

    expect(markOutForDeliveryMock).toHaveBeenCalledWith(order.id)
  })

  it("renders no gate and never blocks when the toggle is off", () => {
    warehouseScanRequiredMock = false
    const order = makeOrder()
    renderPage(
      <OutForDeliveryDialog order={order} open onOpenChange={() => {}} />,
    )

    expect(screen.queryByTestId("scan-gate")).not.toBeInTheDocument()
    expect(screen.getByTestId("out-for-delivery-submit")).toBeEnabled()
  })
})
