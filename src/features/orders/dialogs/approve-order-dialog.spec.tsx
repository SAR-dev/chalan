// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeOrder, renderPage } from "@/app/__tests__/test-utils"
import { ApproveOrderDialog } from "./approve-order-dialog"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ approveOrder: vi.fn() }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({ pickupLocations: [] }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-delivery-cities", () => ({
  useDeliveryCities: () => ({ cities: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-zone-pricing-public", () => ({
  useZonePricingPublic: () => ({ pricing: [] }),
}))

function renderDialog(order: Parameters<typeof makeOrder>[0]) {
  return renderPage(
    <ApproveOrderDialog
      order={makeOrder(order)}
      open
      onOpenChange={() => {}}
    />,
  )
}

/**
 * The approve confirmation is one of the four places `order.itemType` may
 * appear. The other three are covered where they live; what matters here is
 * that the value is genuinely visible to the person approving, and that it is
 * withheld when there is nothing to see.
 */
describe("approve confirmation — item type", () => {
  it("shows what the merchant said is in the parcel", () => {
    renderDialog({ itemType: "Cotton saree" })

    expect(screen.getByTestId("approve-order-item-type")).toHaveTextContent(
      "Cotton saree",
    )
    expect(screen.getByText("Contents")).toBeInTheDocument()
  })

  it("sits beside the parcel weight, which is what it qualifies", () => {
    renderDialog({ itemType: "Cooked food", parcelWeightKg: 3 })

    // The approver reads these together: a weight with no sense of what it
    // weighs is only half the confirmation.
    const rows = screen.getAllByText(/Parcel weight|Contents/)
    expect(rows).toHaveLength(2)
    expect(screen.getByText(/3 KG/)).toBeInTheDocument()
  })

  it("omits the row entirely when no contents were stated", () => {
    renderDialog({ itemType: null })

    // Rendered as an absent row rather than an empty one: a permanently blank
    // "Contents" on every legacy order trains approvers to skip the row that
    // actually carries a value.
    expect(
      screen.queryByTestId("approve-order-item-type"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Contents")).not.toBeInTheDocument()
    // The confirmation itself still renders — this is not a failure state.
    expect(screen.getByText(/Parcel weight/)).toBeInTheDocument()
  })
})
