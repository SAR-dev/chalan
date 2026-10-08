// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import { siteConfig } from "@/config/site"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { DEFAULT_LABEL_TEMPLATE } from "@/lib/label-layout"
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

// =============================================================================
// Engine branch (PDF.md §7): `engine: 'pdfme'` templates generate a real PDF
// through the dynamically-imported pipeline and never mount the legacy print
// portal; the default (blocks) template keeps the portal flow untouched and
// offers no download action.
// =============================================================================

const pdfmeMocks = vi.hoisted(() => ({
  generateLabelPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  printOrDownload: vi.fn(),
  downloadPdf: vi.fn(),
  loadLabelFont: vi.fn(async () => ({
    NotoSansJP: { data: new ArrayBuffer(0) },
  })),
  fetchLogoDataUri: vi.fn(async () => "data:image/png;base64,AAA"),
}))

vi.mock("@/lib/label/generate-pdf", () => ({
  generateLabelPdf: pdfmeMocks.generateLabelPdf,
}))
vi.mock("@/lib/label/print", () => ({
  printOrDownload: pdfmeMocks.printOrDownload,
  downloadPdf: pdfmeMocks.downloadPdf,
}))
vi.mock("@/lib/label/fonts", () => ({
  loadLabelFont: pdfmeMocks.loadLabelFont,
}))
vi.mock("@/lib/label/logo", () => ({
  fetchLogoDataUri: pdfmeMocks.fetchLogoDataUri,
}))

describe("OrderLabelButton (pdfme engine)", () => {
  const template = {
    widthMm: 100,
    heightMm: 150,
    blocks: DEFAULT_LABEL_TEMPLATE.blocks,
    logoRef: null,
    engine: "pdfme" as const,
    template: DEFAULT_LABEL_TEMPLATE_PDFME,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("generates a PDF and hands it to the printer — no legacy print portal", async () => {
    const order = makeOrder({ id: "ORD-100011" })
    render(
      <OrderLabelButton
        order={order}
        merchantName="Acme Store"
        template={template}
      />,
    )

    fireEvent.click(screen.getByTestId("order-label-ORD-100011"))

    await waitFor(() =>
      expect(pdfmeMocks.printOrDownload).toHaveBeenCalledTimes(1),
    )
    expect(pdfmeMocks.generateLabelPdf).toHaveBeenCalledTimes(1)
    expect(pdfmeMocks.loadLabelFont).toHaveBeenCalledTimes(1)
    // The legacy sheet never mounts and window.print is never called.
    expect(document.getElementById("parcel-label-print")).toBeNull()
    expect(pdfmeMocks.printOrDownload.mock.calls[0][1]).toBe(
      "label-ORD-100011.pdf",
    )
  })

  it("offers a download action that saves the same PDF", async () => {
    const order = makeOrder({ id: "ORD-100012" })
    render(<OrderLabelButton order={order} template={template} />)

    fireEvent.click(screen.getByTestId("order-label-download-ORD-100012"))

    await waitFor(() => expect(pdfmeMocks.downloadPdf).toHaveBeenCalledTimes(1))
    expect(pdfmeMocks.printOrDownload).not.toHaveBeenCalled()
    expect(pdfmeMocks.downloadPdf.mock.calls[0][1]).toBe("label-ORD-100012.pdf")
  })

  it("keeps the blocks flow portal-based with no download button", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})

    const order = makeOrder({ id: "ORD-100013" })
    render(<OrderLabelButton order={order} />)

    expect(screen.queryByTestId("order-label-download-ORD-100013")).toBeNull()
    fireEvent.click(screen.getByTestId("order-label-ORD-100013"))
    await waitFor(() =>
      expect(document.getElementById("parcel-label-print")).not.toBeNull(),
    )
    expect(pdfmeMocks.generateLabelPdf).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
