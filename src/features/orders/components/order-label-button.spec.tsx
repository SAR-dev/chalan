// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import { siteConfig } from "@/config/site"
import { OrderLabelButton, orderToLabelData } from "./order-label-button"

describe("orderToLabelData", () => {
  it("maps the order onto the label fields", () => {
    const order = makeOrder({
      id: "ORD-100007",
      recipientName: "Rina Akter",
      recipientPhone: "01712345678",
      deliveryCity: "Dhaka",
      deliveryAddress: "12 Gulshan Ave",
      parcelWeightKg: 1.5,
      productCost: 1250,
    })

    const data = orderToLabelData(order, "Acme Store")

    expect(data.orderId).toBe("ORD-100007")
    // The QR payload is the durable order reference, never a print-time value.
    expect(data.qrValue).toBe("ORD-100007")
    expect(data.merchantName).toBe("Acme Store")
    expect(data.recipientAddress).toBe("Dhaka, 12 Gulshan Ave")
    expect(data.destinationCity).toBe("Dhaka")
    expect(data.weightKg).toBe(1.5)
    expect(data.codAmount).toBe(1250)
    // Platform identity travels with the label so brand blocks resolve on print.
    expect(data.siteName).toBe(siteConfig.name)
    expect(data.siteUrl).toBe(siteConfig.siteUrl)
  })

  it("renders an absent city as an empty destination, not 'null'", () => {
    const order = makeOrder({
      deliveryCity: null,
      deliveryAddress: "123 Test St",
    })

    const data = orderToLabelData(order, "")

    expect(data.destinationCity).toBe("")
    expect(data.recipientAddress).toBe("123 Test St")
  })
})

describe("OrderLabelButton", () => {
  function stubPrint() {
    vi.spyOn(window, "print").mockImplementation(() => {})
    // Print only fires from inside a rAF so the portal has painted; run it
    // synchronously in tests.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("prints the order's label when clicked", async () => {
    stubPrint()
    const order = makeOrder({ id: "ORD-100009", recipientName: "Karim" })
    render(<OrderLabelButton order={order} merchantName="Acme Store" />)

    // Nothing is mounted until the user asks to print.
    expect(document.getElementById("parcel-label-print")).toBeNull()

    fireEvent.click(screen.getByTestId("order-label-ORD-100009"))

    await waitFor(() =>
      expect(document.getElementById("parcel-label-print")).not.toBeNull(),
    )
    expect(window.print).toHaveBeenCalledTimes(1)
    const printed = document.getElementById("parcel-label-print")?.textContent
    expect(printed).toContain("ORD-100009")
    expect(printed).toContain("Acme Store")
    expect(printed).toContain("Karim")
  })

  it("removes the print sheet once printing finishes", async () => {
    stubPrint()
    const order = makeOrder({ id: "ORD-100010" })
    render(<OrderLabelButton order={order} />)

    fireEvent.click(screen.getByTestId("order-label-ORD-100010"))
    await waitFor(() =>
      expect(document.getElementById("parcel-label-print")).not.toBeNull(),
    )

    fireEvent(window, new Event("afterprint"))

    await waitFor(() =>
      expect(document.getElementById("parcel-label-print")).toBeNull(),
    )
  })
})
