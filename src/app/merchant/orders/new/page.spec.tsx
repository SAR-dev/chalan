// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({
    currentMerchant: {
      id: "m_1",
      businessName: "Test Biz",
      isActive: true,
      status: "ACTIVE",
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
      nidVerifiedAt: "2026-01-01T00:00:00.000Z",
      baseRate: 60,
      extraRatePerKg: 20,
      freeWeightKg: 2,
      maxWeightKg: 30,
    },
    merchants: [],
    isLoading: false,
  }),
}))
vi.mock("@/features/pickup-locations/hooks/use-pickup-locations", () => ({
  usePickupLocations: () => ({
    pickupLocations: [
      { id: "pl_1", merchantId: "m_1", label: "Banani hub", cityId: "c_1" },
    ],
  }),
}))
vi.mock("@/features/platform-config/hooks/use-delivery-cities", () => ({
  useDeliveryCities: () => ({ cities: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-delivery-zones", () => ({
  useDeliveryZones: () => ({ zones: [] }),
}))
vi.mock("@/features/platform-config/hooks/use-zone-pricing-public", () => ({
  useZonePricingPublic: () => ({ pricing: [] }),
}))
vi.mock("@/features/packages/hooks/use-packages", () => ({
  usePackages: () => ({ packages: [], activePackage: null }),
}))
vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ createOrders: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "MERCHANT", merchantId: "m_1" })
})

async function importPage() {
  const Page = (await import("./page")).default
  return renderPage(<Page />)
}

describe("Merchant new order page", () => {
  it("renders order creation form", async () => {
    await importPage()
    expect(screen.getByText(/new delivery order/i)).toBeInTheDocument()
  })

  // The pickup location decides the lane, and therefore the fee shown in the
  // card header — so it has to be answered before anything else on the screen
  // is worth filling in. Regression guard for field order.
  it("asks for the pickup location before any other field", async () => {
    const { container } = await importPage()

    const form = container.querySelector("form")
    expect(form).not.toBeNull()

    const firstControl = form!.querySelector("button, input, select, textarea")
    expect(firstControl).toHaveAttribute("data-testid", "pickup-location")

    // …and it really is first in the document, not merely the first control
    // among controls.
    const pickup = form!.querySelector("[data-testid='pickup-location']")
    const recipientName = form!.querySelector("[data-testid='recipient-name']")
    expect(pickup).not.toBeNull()
    expect(recipientName).not.toBeNull()
    expect(
      pickup!.compareDocumentPosition(recipientName!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("groups the fields into labelled sections", async () => {
    const { container } = await importPage()

    const legends = [...container.querySelectorAll("legend")].map(
      (el) => el.textContent,
    )
    expect(legends).toEqual([
      "Pickup",
      "Recipient",
      "Delivery",
      "Parcel details",
      "Payment & notes",
    ])

    // Pickup owns its own section, ahead of the rest — grouping them together
    // would put the answer the form needs first behind another heading.
    const fieldsets = [...container.querySelectorAll("fieldset")]
    expect(
      fieldsets[0].querySelector("[data-testid='pickup-location']"),
    ).not.toBeNull()
  })

  it("reports a failed submit once in the summary and once under the field", async () => {
    const { container } = await importPage()

    const form = container.querySelector("form")!
    fireEvent.submit(form)

    // The summary is the focus target, so a screen-reader user hears every
    // failure at once instead of one field at a time.
    const summary = screen.getByTestId("form-errors")
    expect(summary).toBeInTheDocument()
    expect(summary).toHaveAttribute("role", "alert")
    expect(summary).toHaveFocus()

    // The same message also sits under the control it is about, wired up by
    // `Input`'s own `error` prop.
    const inline = container.querySelector("[data-slot='input-error']")
    expect(inline).not.toBeNull()
    expect(inline!.textContent).toMatch(/required/i)
    expect(
      inline!.closest(".flex.flex-col")!.querySelector("input"),
    ).toHaveAttribute("aria-invalid", "true")
  })

  it("stays quiet until the first submit", async () => {
    const { container } = await importPage()

    expect(screen.queryByTestId("form-errors")).not.toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='input-error']"),
    ).not.toBeInTheDocument()
  })

  it("offers a clear submit control", async () => {
    await importPage()

    const submit = screen.getByTestId("submit-order")
    expect(submit).toBeEnabled()
    expect(submit).toHaveTextContent("Confirm 1 order")
  })
})
