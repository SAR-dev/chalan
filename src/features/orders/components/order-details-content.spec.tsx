// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeOrder, renderPage } from "@/app/__tests__/test-utils"
import { OrderDetailsContent } from "./order-details-content"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: null }),
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({ riders: [] }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [] }),
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

describe("recipient email in order details (R8)", () => {
  it("shows the address, as a mailto link the operator can act on", () => {
    renderPage(
      <OrderDetailsContent
        order={makeOrder({ recipientMail: "recipient@example.com" })}
      />,
    )

    const row = screen.getByTestId("recipient-mail")
    expect(row).toHaveTextContent("recipient@example.com")
    // A raw address is a dead end on a screen someone works from all day.
    const link = row.querySelector("a")
    expect(link?.getAttribute("href")).toBe("mailto:recipient@example.com")
  })

  it("omits the row entirely when the merchant never collected one", () => {
    // Not an em-dash: a permanently empty field on every legacy order teaches
    // readers to skip the row that actually has a value. Same reasoning as
    // `itemType`.
    renderPage(<OrderDetailsContent order={makeOrder()} />)

    expect(screen.queryByTestId("recipient-mail")).not.toBeInTheDocument()
  })
})

describe("delivery progress in order details", () => {
  it("renders the step count for a parcel mid-route", () => {
    // IN_WAREHOUSE is rank 4 of 0-6, so step 5 of 7 and 67%.
    renderPage(
      <OrderDetailsContent order={makeOrder({ status: "IN_WAREHOUSE" })} />,
    )

    const block = screen.getByTestId("order-progress")
    expect(block).toHaveTextContent("Step 5 of 7")

    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuenow", "67")
    expect(bar).toHaveAttribute("aria-label", "Delivery progress")
  })

  it("shows a completed bar once delivered", () => {
    renderPage(
      <OrderDetailsContent order={makeOrder({ status: "DELIVERED" })} />,
    )

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
    expect(screen.getByTestId("order-progress")).toHaveTextContent(
      "Step 7 of 7",
    )
  })

  it("withholds the bar from a cancelled order", () => {
    // Progress toward a destination the parcel will never reach is not
    // progress — decided in `deliveryProgress`, so both surfaces agree.
    renderPage(
      <OrderDetailsContent order={makeOrder({ status: "CANCELLED" })} />,
    )

    expect(screen.queryByTestId("order-progress")).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })
})

describe("section and field colour", () => {
  it("tints field chips from the shared badge palette, not one flat grey", () => {
    // Guards against a silent regression: if the icon lookup stopped matching,
    // every chip would quietly fall back to `bg-muted` and the page would look
    // like it had no colour at all — while every other assertion still passed.
    const { container } = renderPage(
      <OrderDetailsContent order={makeOrder()} />,
    )

    const chips = [...container.querySelectorAll("span.rounded-md")]
    const classes = chips.map((c) => c.getAttribute("class") ?? "")
    const tinted = classes.filter((c) => !c.includes("bg-muted"))

    expect(chips.length).toBeGreaterThan(3)
    expect(tinted.length).toBeGreaterThan(0)
    // More than one distinct tint, or the map is collapsing to a single tone.
    expect(new Set(tinted).size).toBeGreaterThan(1)
  })

  it("keeps the dark-mode half of each tone", () => {
    // Stripping the badge border classes must not strip the `dark:` overrides
    // along with them — that would leave, say, violet-600 text on a dark
    // background. Violet is the tone to check: it is one of the palette entries
    // that actually carries a dark variant, and a default order renders it.
    const { container } = renderPage(
      <OrderDetailsContent order={makeOrder()} />,
    )
    const violetChip = [...container.querySelectorAll("span.rounded-md")].find(
      (c) => (c.getAttribute("class") ?? "").includes("text-violet-600"),
    )

    expect(violetChip).toBeDefined()
    const cls = violetChip?.getAttribute("class") ?? ""
    expect(cls).toContain("dark:text-violet-400")
    // The border half is still dropped — a 28px rounded chip has no border.
    expect(cls).not.toContain("border")
  })
})
