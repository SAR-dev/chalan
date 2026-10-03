// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import { RunSheetCard } from "./run-sheet-card"

function stubSheet(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  )
}

function sheet(overrides: Record<string, unknown> = {}) {
  return {
    riderId: "RID-000001",
    riderName: "Rafi",
    stops: [
      {
        orderId: "ORD-000001",
        sequence: 1,
        zoneId: "ZN-DHAKA",
        zoneName: "Dhaka Metro",
        cityName: "Dhaka",
      },
      {
        orderId: "ORD-000003",
        sequence: 2,
        zoneId: "ZN-DHAKA",
        zoneName: "Dhaka Metro",
        cityName: "Gazipur",
      },
      {
        orderId: "ORD-000002",
        sequence: 3,
        zoneId: "ZN-SYLHET",
        zoneName: "Divisional Cities",
        cityName: "Sylhet",
      },
    ],
    zoneHops: 1,
    zoneCount: 2,
    ...overrides,
  }
}

/**
 * Per-test SWR cache. SWR's default cache is module-level, so it outlives
 * `cleanup()` and leaks between tests — every case here uses the same rider id,
 * so without this the second test onward would render the first test's sheet.
 */
let swrCache = new Map()

function renderCard(ui: ReactElement) {
  return renderPage(
    <SWRConfig
      value={{
        provider: () => swrCache,
        dedupingInterval: 0,
        shouldRetryOnError: false,
      }}
    >
      {ui}
    </SWRConfig>,
  )
}

beforeEach(() => {
  swrCache = new Map()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("RunSheetCard", () => {
  it("renders nothing without a rider", () => {
    // A rider shell can paint before the profile resolves; an empty card with a
    // "0 parcels" claim would be a lie about the rider's day.
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { container } = renderCard(<RunSheetCard riderId={null} />)

    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lists the stops in the order the server sequenced them", async () => {
    stubSheet(sheet())
    renderCard(<RunSheetCard riderId="RID-000001" />)

    // The card itself must be addressable: an e2e assertion that falls back to
    // heading text passes even if the card stopped rendering that heading for
    // some other reason.
    expect(screen.getByTestId("run-sheet")).toBeInTheDocument()
    await screen.findByText("ORD-000001")
    // Sequence 1, 2, 3 — the grouped order, not parcel age. Re-sorting here
    // would undo the whole point of the sheet.
    expect(screen.getByTestId("run-sheet-stop-1")).toHaveTextContent(
      "ORD-000001",
    )
    expect(screen.getByTestId("run-sheet-stop-2")).toHaveTextContent(
      "ORD-000003",
    )
    expect(screen.getByTestId("run-sheet-stop-3")).toHaveTextContent(
      "ORD-000002",
    )
  })

  it("shows the city and zone for each stop", async () => {
    stubSheet(sheet())
    renderCard(<RunSheetCard riderId="RID-000001" />)

    await screen.findByText("ORD-000002")
    // City and zone are tagged separately. Asserted by test id rather than off
    // the joined line, because a spec that reads the zone out of
    // "Gazipur · Dhaka Metro" is one rename away from silently matching
    // nothing — and the zone is the field the whole run sheet is built on.
    expect(screen.getByTestId("run-sheet-destination-2")).toHaveTextContent(
      "Gazipur",
    )
    expect(screen.getByTestId("run-sheet-zone-2")).toHaveTextContent(
      "Dhaka Metro",
    )
  })

  it("keeps a zone's stops contiguous", async () => {
    // The grouping is the product. Stops 1 and 2 share a zone and the third
    // does not, so the two Dhaka Metro runs must render with nothing of the
    // other zone in between.
    stubSheet(sheet())
    renderCard(<RunSheetCard riderId="RID-000001" />)

    await screen.findByText("ORD-000002")
    expect(screen.getByTestId("run-sheet-zone-1")).toHaveTextContent(
      "Dhaka Metro",
    )
    expect(screen.getByTestId("run-sheet-zone-2")).toHaveTextContent(
      "Dhaka Metro",
    )
    expect(screen.getByTestId("run-sheet-zone-3")).toHaveTextContent(
      "Divisional Cities",
    )
  })

  it("reports how many areas the run crosses", async () => {
    stubSheet(sheet())
    renderCard(<RunSheetCard riderId="RID-000001" />)

    // The saving is the headline: 3 parcels, 2 areas, 1 crossing.
    expect(
      await screen.findByText("3 parcels · 2 areas, 1 crossing"),
    ).toBeInTheDocument()
  })

  it("says one area rather than counting a crossing that is not there", async () => {
    stubSheet(sheet({ stops: [sheet().stops[0]], zoneHops: 0, zoneCount: 1 }))
    renderCard(<RunSheetCard riderId="RID-000001" />)

    expect(await screen.findByText("1 parcel · one area")).toBeInTheDocument()
  })

  it("uses the plural for more than one crossing", async () => {
    stubSheet(sheet({ zoneHops: 2, zoneCount: 3 }))
    renderCard(<RunSheetCard riderId="RID-000001" />)

    expect(
      await screen.findByText("3 parcels · 3 areas, 2 crossings"),
    ).toBeInTheDocument()
  })

  it("says so when the rider has no parcels yet", async () => {
    stubSheet(sheet({ stops: [], zoneHops: 0, zoneCount: 0 }))
    renderCard(<RunSheetCard riderId="RID-000001" />)

    expect(
      await screen.findByText("No parcels on your run yet."),
    ).toBeInTheDocument()
  })

  it("names a parcel whose destination was never set", async () => {
    // A legacy order with no delivery city still needs a line in the run, and
    // must not be shown as though it had a place.
    stubSheet(
      sheet({
        stops: [
          {
            orderId: "ORD-000007",
            sequence: 1,
            zoneId: null,
            zoneName: null,
            cityName: null,
          },
        ],
        zoneHops: 0,
        zoneCount: 1,
      }),
    )
    renderCard(<RunSheetCard riderId="RID-000001" />)

    expect(await screen.findByText("Destination not set")).toBeInTheDocument()
  })

  it("offers a retry when the sheet cannot be loaded", async () => {
    stubSheet({ error: "boom" }, 500)
    renderCard(<RunSheetCard riderId="RID-000001" />)

    expect(
      await screen.findByText("Could not load your run order."),
    ).toBeInTheDocument()
    expect(screen.getByText("Try again")).toBeInTheDocument()
  })
})
