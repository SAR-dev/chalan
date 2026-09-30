// @vitest-environment jsdom

import { render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import { riderParcelColumn, useOrderColumns } from "./order-table-columns"

vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({ pickupLocations: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-delivery-cities", () => ({
  useDeliveryCities: () => ({ cities: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-zone-pricing-public", () => ({
  useZonePricingPublic: () => ({ pricing: [] }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
}))

/**
 * `order.itemType` is allowed at exactly four places: the create form, the
 * admin's approve confirmation, the order details page, and the merchant
 * orders list. Everything else is a regression, so these assert the surfaces
 * that must *not* carry it — the ones it was removed from this round.
 *
 * The permitted surfaces are covered where they live: the approve dialog has
 * its own spec, and the merchant list and order details are asserted through
 * the pages that render them.
 */
describe("item type is absent from the shared order lists", () => {
  it("excludes it from the admin dashboard order list", () => {
    const { result } = renderHook(() => useOrderColumns())
    const ids = result.current.map((c) => c.id)

    // `useOrderColumns()` feeds `/dashboard/orders` only — the merchant list
    // builds its own columns and is one of the four permitted surfaces.
    expect(ids).not.toContain("itemType")
    // The guard is not vacuous: the weight column it sat beside is still here.
    expect(ids).toContain("weight")
  })

  it("keeps the order, weight and status columns around it", () => {
    const { result } = renderHook(() => useOrderColumns())
    const ids = result.current.map((c) => c.id)
    for (const id of ["order", "weight", "status"]) {
      expect(ids).toContain(id)
    }
  })
})

describe("riderParcelColumn", () => {
  it("shows the weight the rider has to carry", () => {
    const col = riderParcelColumn()
    render(<>{col.cell?.(makeOrder({ parcelWeightKg: 3 }))}</>)
    expect(screen.getByText("3 KG")).toBeInTheDocument()
  })

  it("no longer shows the merchant-stated contents", () => {
    // The rider queues are outside the four permitted surfaces. Weight stays —
    // the rider still needs it to decide whether they can take the parcel —
    // but the contents must not reach them.
    const col = riderParcelColumn()
    render(
      <>
        {col.cell?.(makeOrder({ parcelWeightKg: 2, itemType: "Cotton saree" }))}
      </>,
    )
    expect(screen.getByText("2 KG")).toBeInTheDocument()
    expect(screen.queryByText("Cotton saree")).not.toBeInTheDocument()
    expect(screen.queryByText(/contents not stated/i)).not.toBeInTheDocument()
  })

  it("sorts on weight, since there is nothing else left to sort on", () => {
    const col = riderParcelColumn()
    expect(col.sortable).toBe(true)
    expect(col.sortValue?.(makeOrder({ parcelWeightKg: 7 }))).toBe(7)
  })
})
