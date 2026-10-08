// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import { siteConfig } from "@/config/site"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
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

// =============================================================================
// pdfme engine: templates generate a real PDF through the dynamically-imported
// pipeline. The default template uses the pdfme flow.
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
    logoRef: null,
    template: DEFAULT_LABEL_TEMPLATE_PDFME,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("generates a PDF and hands it to the printer", async () => {
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

  it("uses the default pdfme template when none is provided", async () => {
    const order = makeOrder({ id: "ORD-100013" })
    render(<OrderLabelButton order={order} />)

    fireEvent.click(screen.getByTestId("order-label-ORD-100013"))

    await waitFor(() =>
      expect(pdfmeMocks.printOrDownload).toHaveBeenCalledTimes(1),
    )
    expect(pdfmeMocks.generateLabelPdf).toHaveBeenCalledTimes(1)
  })
})
