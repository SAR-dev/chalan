// @vitest-environment jsdom

import { render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import {
  itemTypeColumn,
  riderParcelColumn,
  useOrderColumns,
} from "./order-table-columns"

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
 * The item type and the rider's parcel column are the two read surfaces of the
 * merchant-stated contents. They are asserted directly here rather than through
 * a page: a page spec passes as long as *something* renders, which is exactly
 * the shape of test that would let a dropped column go unnoticed.
 */
describe("itemTypeColumn", () => {
  it("shows the merchant's own words when they stated some", () => {
    const col = itemTypeColumn()
    render(<>{col.cell?.(makeOrder({ itemType: "Cotton saree" }))}</>)
    expect(screen.getByText("Cotton saree")).toBeInTheDocument()
  })

  it("says plainly that nothing was stated rather than leaving a blank cell", () => {
    const col = itemTypeColumn()
    render(<>{col.cell?.(makeOrder({ itemType: null }))}</>)
    // A blank cell is indistinguishable from one that failed to load, so an
    // empty value has to read as an empty value.
    expect(screen.getByText("Not stated")).toBeInTheDocument()
  })

  it("is not sortable — free text a merchant typed is alphabetical noise", () => {
    const col = itemTypeColumn()
    expect(col.sortable).toBeFalsy()
    expect(col.sortValue).toBeUndefined()
  })

  it("keeps the column hidden on narrow screens", () => {
    const col = itemTypeColumn()
    expect(col.headClassName).toContain("hidden lg:table-cell")
    expect(col.cellClassName).toContain("hidden lg:table-cell")
  })
})

describe("riderParcelColumn", () => {
  it("shows weight and contents together, because they are one decision", () => {
    const col = riderParcelColumn()
    render(
      <>
        {col.cell?.(makeOrder({ parcelWeightKg: 3, itemType: "Cooked food" }))}
      </>,
    )
    expect(screen.getByText("3 KG")).toBeInTheDocument()
    expect(screen.getByText("Cooked food")).toBeInTheDocument()
  })

  it("still shows the weight when no contents were given", () => {
    const col = riderParcelColumn()
    render(<>{col.cell?.(makeOrder({ parcelWeightKg: 2, itemType: null }))}</>)
    expect(screen.getByText("2 KG")).toBeInTheDocument()
    expect(screen.getByText("Contents not stated")).toBeInTheDocument()
  })

  it("is not sortable", () => {
    expect(riderParcelColumn().sortable).toBeFalsy()
  })
})

describe("useOrderColumns", () => {
  it("includes the item type beside the weight on the shared order lists", () => {
    // This is the column that was silently droppable: the lists are assembled
    // by array position, so an omission compiles, lints and renders — it just
    // shows less.
    const { result } = renderHook(() => useOrderColumns())
    const ids = result.current.map((c) => c.id)
    expect(ids).toContain("itemType")
    expect(ids.indexOf("itemType")).toBeGreaterThan(ids.indexOf("weight"))
  })
})
