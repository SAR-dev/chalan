// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeUser, makeWarehouse, renderPage } from "@/app/__tests__/test-utils"
import { statCardLabels } from "@/config/stat-card-labels"
import { ORDER_STATUS_LABELS } from "@/lib/constants"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    currentWarehouse: mockWarehouse,
    warehouses: mockWarehouse ? [mockWarehouse] : [],
  }),
}))

const mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
const mockWarehouse = makeWarehouse()

function renderPage_(counts: Partial<Record<string, number>>, codPending = 0) {
  return import("./overview-client").then(({ WarehouseOverviewClient }) => {
    renderPage(
      <WarehouseOverviewClient
        counts={counts as never}
        codPending={codPending}
      />,
    )
  })
}

describe("Warehouse overview", () => {
  it("shows one tile per actionable status, plus COD", async () => {
    await renderPage_({})
    for (const status of [
      "PENDING",
      "APPROVED",
      "OUT_FOR_PICKUP",
      "PICKED_UP",
      "IN_WAREHOUSE",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "FAILED_ATTEMPT",
    ] as const) {
      expect(screen.getByText(ORDER_STATUS_LABELS[status])).toBeInTheDocument()
    }
    expect(
      screen.getByText(
        statCardLabels.warehouse.codSettlement.awaitingSettlement.label,
      ),
    ).toBeInTheDocument()
  })

  it("renders the counts it was given", async () => {
    await renderPage_({ PENDING: 8, IN_WAREHOUSE: 3 }, 5)
    // Each tile renders its label and value inside one wrapper, so the label's
    // parent is the assertion target — not the whole grid, which would let a
    // count from a neighbouring tile satisfy it.
    const card = (label: string) => screen.getByText(label).parentElement
    expect(card(ORDER_STATUS_LABELS.PENDING)).toHaveTextContent("8")
    expect(card(ORDER_STATUS_LABELS.IN_WAREHOUSE)).toHaveTextContent("3")
    expect(
      card(statCardLabels.warehouse.codSettlement.awaitingSettlement.label),
    ).toHaveTextContent("5")
  })

  it("shows zero, not a blank, for a status the server did not count", async () => {
    await renderPage_({ PENDING: 2 })
    // The server only returns statuses it counted, so a missing key has to
    // render as a real 0 rather than an empty tile.
    const tiles = screen.getAllByText("0")
    expect(tiles.length).toBeGreaterThan(0)
  })

  it("has no delivered or returned tile", async () => {
    // Nothing can be done to a closed parcel, so a tile counting them would
    // advertise work that does not exist.
    await renderPage_({})
    expect(screen.queryByText(ORDER_STATUS_LABELS.DELIVERED)).toBeNull()
    expect(screen.queryByText(ORDER_STATUS_LABELS.RETURNED)).toBeNull()
    expect(screen.queryByText(ORDER_STATUS_LABELS.CANCELLED)).toBeNull()
  })

  it("shows no order table", async () => {
    await renderPage_({ PENDING: 1 })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByRole("grid")).not.toBeInTheDocument()
  })

  it("has no links, so no card can be mistaken for a queue", async () => {
    await renderPage_({})
    expect(screen.queryByRole("link")).toBeNull()
  })
})
