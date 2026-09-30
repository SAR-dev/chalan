// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import { ZonePricingPageClient } from "./zone-pricing-client"

const zones = [
  { id: "ZN-1", name: "Dhaka Metro" },
  { id: "ZN-2", name: "Gazipur" },
]

const pricing = [
  {
    id: "zp-1",
    fromZoneId: "ZN-1",
    toZoneId: "ZN-2",
    baseRate: 100,
    extraRatePerKg: 20,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 2,
    cancellationFee: 25,
  },
]

let mockPricing = pricing
let mockIsLoading = false

vi.mock("@/features/platform-config/hooks/use-delivery-zones", () => ({
  useDeliveryZones: () => ({
    zones,
    isLoading: false,
    isRefreshing: false,
  }),
}))

vi.mock("@/features/platform-config/hooks/use-zone-pricing", () => ({
  useZonePricing: () => ({
    pricing: mockPricing,
    isLoading: mockIsLoading,
    isRefreshing: false,
    deletePricing: vi.fn(),
    createPricing: vi.fn(),
    mutate: vi.fn(),
  }),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The DataTable pulls the user through useAuth for its refresh affordances.
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({
    currentUser: {
      id: "USR-1",
      name: "Admin",
      email: "admin@email.com",
      role: "SUPER_ADMIN",
      merchantId: null,
      riderId: null,
      warehouseId: null,
    },
  }),
}))

describe("ZonePricingPageClient — list/matrix toggle", () => {
  beforeEach(() => {
    mockPricing = pricing
    mockIsLoading = false
  })

  it("opens on the list, because that is the view with the row actions", () => {
    renderPage(<ZonePricingPageClient />)

    // The list is where a rate can be added, edited or deleted. Defaulting to
    // the read-only matrix would drop the admin on a view they cannot act from.
    expect(screen.getByTestId("zone-pricing-list-view")).toBeInTheDocument()
    expect(screen.queryByTestId("zone-rate-matrix")).not.toBeInTheDocument()
  })

  it("shows the same rates as a matrix when the matrix is selected", async () => {
    const user = userEvent.setup()
    renderPage(<ZonePricingPageClient />)

    await user.click(screen.getByTestId("zone-pricing-view-matrix"))

    expect(screen.getByTestId("zone-rate-matrix")).toBeInTheDocument()
    expect(
      screen.queryByTestId("zone-pricing-list-view"),
    ).not.toBeInTheDocument()
    // Both zones appear as axes, so the one configured lane is a real cell
    // rather than an empty grid.
    expect(screen.getByText("Dhaka Metro")).toBeInTheDocument()
    expect(screen.getByText("Gazipur")).toBeInTheDocument()
  })

  it("keeps the toggle reachable from the matrix, so there is a way back", async () => {
    const user = userEvent.setup()
    renderPage(<ZonePricingPageClient />)

    // The structural trap: a toggle inside the table toolbar disappears the
    // moment the matrix is selected, stranding the admin with no way back.
    // Assert both triggers still exist, then actually navigate back.
    await user.click(screen.getByTestId("zone-pricing-view-matrix"))
    expect(screen.getByTestId("zone-pricing-view-list")).toBeInTheDocument()

    await user.click(screen.getByTestId("zone-pricing-view-list"))
    expect(screen.getByTestId("zone-pricing-list-view")).toBeInTheDocument()
    expect(screen.queryByTestId("zone-rate-matrix")).not.toBeInTheDocument()
  })

  it("does not claim there are no rates while the first load is still running", async () => {
    mockIsLoading = true
    mockPricing = []
    const user = userEvent.setup()
    renderPage(<ZonePricingPageClient />)

    await user.click(screen.getByTestId("zone-pricing-view-matrix"))

    // `pricing` is [] until the fetch resolves. Without the loading gate the
    // matrix would render its empty state, telling the admin they have no rates
    // configured when they have simply not loaded yet.
    expect(
      screen.getByTestId("zone-pricing-matrix-loading"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("zone-rate-matrix-empty"),
    ).not.toBeInTheDocument()
  })
})
