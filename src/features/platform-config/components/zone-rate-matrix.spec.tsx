// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { formatTk } from "@/lib/pricing"
import { ZoneRateMatrix } from "./zone-rate-matrix"

const zones = [
  { id: "ZN-1", name: "Dhaka Metro" },
  { id: "ZN-2", name: "Gazipur" },
]

function rate(
  fromZoneId: string,
  toZoneId: string,
  overrides: Record<string, number> = {},
) {
  return {
    id: `zp-${fromZoneId}-${toZoneId}`,
    fromZoneId,
    toZoneId,
    baseRate: 100,
    extraRatePerKg: 20,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 2,
    cancellationFee: 25,
    ...overrides,
  }
}

/**
 * Finds a cell by its lane. `getByTestId` matches the testid value exactly
 * rather than parsing CSS, so lane addressing goes through `data-lane`.
 */
function laneCell(
  container: HTMLElement,
  fromZoneId: string,
  toZoneId: string,
): HTMLElement {
  const el = container.querySelector(`[data-lane="${fromZoneId}:${toZoneId}"]`)
  if (!el) throw new Error(`No matrix cell for ${fromZoneId} -> ${toZoneId}`)
  return el as HTMLElement
}

/**
 * A full 2×2 grid with exactly one lane missing: ZN-2 → ZN-2.
 *
 * Rows and columns are the union of the *sides* of the rates, so a single rate
 * yields a single cell rather than a grid — a gap only exists when both zones
 * already appear elsewhere.
 */
const gridWithGap = [
  rate("ZN-1", "ZN-1", { baseRate: 70 }),
  rate("ZN-1", "ZN-2", { baseRate: 80 }),
  rate("ZN-2", "ZN-1", { baseRate: 95 }),
]

describe("ZoneRateMatrix", () => {
  it("renders one cell per configured lane, showing its base rate", () => {
    const { container } = render(
      <ZoneRateMatrix
        zones={zones}
        rates={[rate("ZN-1", "ZN-2", { baseRate: 80 })]}
      />,
    )

    const only = laneCell(container, "ZN-1", "ZN-2")
    expect(only).toHaveAttribute("data-priced", "true")
    expect(only).toHaveTextContent(formatTk(80))
    // Nothing selected yet, so the detail is the prompt rather than a price.
    expect(screen.getByTestId("zone-matrix-detail")).toHaveTextContent(
      /Select a cell/,
    )
  })

  it("keeps the two directions as separate cells", () => {
    // Pricing is directional: X→Y and Y→X are different rates, so a symmetric
    // cell would quote the wrong lane half the time.
    const { container } = render(
      <ZoneRateMatrix
        zones={zones}
        rates={[
          rate("ZN-1", "ZN-2", { baseRate: 80 }),
          rate("ZN-2", "ZN-1", { baseRate: 95 }),
        ]}
      />,
    )

    expect(laneCell(container, "ZN-1", "ZN-2")).toHaveTextContent(formatTk(80))
    expect(laneCell(container, "ZN-2", "ZN-1")).toHaveTextContent(formatTk(95))
  })

  it("shows an em dash for a lane with no rate, never a price", () => {
    const { container } = render(
      <ZoneRateMatrix zones={zones} rates={gridWithGap} />,
    )

    // ZN-2 → ZN-2 is in the grid (both zones appear elsewhere) but has no row,
    // so it must not be quoted — an unpriced route cannot be ordered on.
    const unpriced = laneCell(container, "ZN-2", "ZN-2")
    expect(unpriced).toHaveAttribute("data-priced", "false")
    expect(unpriced).toHaveTextContent("—")
    expect(screen.getByTestId("zone-matrix-unpriced")).toBeInTheDocument()
    // And it says so to a screen reader rather than reading as a dash.
    expect(unpriced).toHaveAccessibleName(/Gazipur to Gazipur: not configured/)
  })

  it("labels each cell with its own route and price", () => {
    const { container } = render(
      <ZoneRateMatrix zones={zones} rates={gridWithGap} />,
    )
    expect(laneCell(container, "ZN-1", "ZN-2")).toHaveAccessibleName(
      `Dhaka Metro to Gazipur: ${formatTk(80)}`,
    )
  })

  it("reveals the full rates for the selected lane", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ZoneRateMatrix zones={zones} rates={gridWithGap} />,
    )

    await user.click(laneCell(container, "ZN-1", "ZN-2"))

    expect(screen.getByTestId("zone-matrix-detail-lane")).toHaveTextContent(
      "Dhaka Metro → Gazipur",
    )
    const detail = screen.getByTestId("zone-matrix-detail")
    expect(detail).toHaveTextContent(formatTk(80)) // base rate
    expect(detail).toHaveTextContent(formatTk(20)) // extra per KG
    expect(detail).toHaveTextContent("1 KG") // free weight
    expect(detail).toHaveTextContent("10 KG") // max weight
    expect(detail).toHaveTextContent("2%") // COD
    expect(detail).toHaveTextContent(formatTk(25)) // cancellation fee
  })

  it("explains an unpriced lane instead of showing empty rates", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ZoneRateMatrix zones={zones} rates={gridWithGap} />,
    )

    await user.click(laneCell(container, "ZN-2", "ZN-2"))

    expect(screen.getByTestId("zone-matrix-detail")).toHaveTextContent(
      /No rate is configured for this route/,
    )
    expect(screen.getByTestId("zone-matrix-detail-lane")).toHaveTextContent(
      "Gazipur → Gazipur",
    )
  })

  it("clears the detail when the selected cell is clicked again", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ZoneRateMatrix zones={zones} rates={gridWithGap} />,
    )

    const target = laneCell(container, "ZN-1", "ZN-2")
    await user.click(target)
    expect(screen.getByTestId("zone-matrix-detail-lane")).toBeInTheDocument()

    await user.click(target)
    expect(
      screen.queryByTestId("zone-matrix-detail-lane"),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("zone-matrix-detail")).toHaveTextContent(
      /Select a cell/,
    )
  })

  it("says so when nothing is configured at all", () => {
    render(<ZoneRateMatrix zones={zones} rates={[]} />)
    expect(screen.getByTestId("zone-rate-matrix-empty")).toHaveTextContent(
      /No route rates have been configured yet/,
    )
    expect(screen.queryByTestId("zone-rate-matrix")).not.toBeInTheDocument()
  })

  it("falls back to a raw id when a zone has no name", () => {
    // A rate pointing at a zone we could not load must still render — showing
    // the id is honest, dropping the row would hide a real lane.
    render(<ZoneRateMatrix zones={zones} rates={[rate("ZN-GONE", "ZN-1")]} />)
    expect(screen.getByText("ZN-GONE")).toBeInTheDocument()
  })
})
