import type { Template } from "@pdfme/common"
import { describe, expect, it } from "vitest"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { buildLabelInputs } from "@/lib/label/label-inputs"
import { SAMPLE_LABEL_DATA } from "@/lib/label-layout"

// =============================================================================
// buildLabelInputs (PDF.md §5 binding rules): every element resolves to its
// input value by *name* — label field keys through resolveLabelField, any QR
// to the order reference, the `logo` element to the data URI, static
// readOnly elements skipped, everything else to its static content.
// =============================================================================

function templateWith(
  elements: NonNullable<Template["schemas"][number]>,
): Template {
  return {
    basePdf: { width: 100, height: 150, padding: [0, 0, 0, 0] },
    schemas: [elements],
  }
}

const DATA = SAMPLE_LABEL_DATA

describe("buildLabelInputs", () => {
  it("binds every label field key through resolveLabelField", () => {
    const t = templateWith([
      {
        name: "orderId",
        type: "text",
        position: { x: 5, y: 5 },
        width: 50,
        height: 8,
      },
      {
        name: "recipientName",
        type: "text",
        position: { x: 5, y: 15 },
        width: 50,
        height: 8,
      },
      {
        name: "recipientPhone",
        type: "text",
        position: { x: 5, y: 25 },
        width: 50,
        height: 6,
      },
      {
        name: "destinationCity",
        type: "text",
        position: { x: 5, y: 35 },
        width: 50,
        height: 6,
      },
      {
        name: "weight",
        type: "text",
        position: { x: 5, y: 45 },
        width: 50,
        height: 6,
      },
      {
        name: "codAmount",
        type: "text",
        position: { x: 5, y: 55 },
        width: 50,
        height: 6,
      },
    ])
    const [input] = buildLabelInputs(t, DATA)
    expect(input.orderId).toBe("ORD-100001")
    expect(input.recipientName).toBe("Ayesha Rahman")
    expect(input.recipientPhone).toBe("01712-345678")
    expect(input.destinationCity).toBe("Dhaka")
    expect(input.weight).toBe("1.5 kg")
    expect(input.codAmount).toBe("COD 1,250 TK")
  })

  it("binds any qrcode element — and any name starting with qr — to the QR value", () => {
    const t = templateWith([
      {
        name: "qr",
        type: "qrcode",
        position: { x: 60, y: 5 },
        width: 30,
        height: 30,
      },
      {
        name: "backQr",
        type: "qrcode",
        position: { x: 5, y: 5 },
        width: 30,
        height: 30,
      },
      {
        name: "qrFallbackText",
        type: "text",
        position: { x: 5, y: 40 },
        width: 30,
        height: 6,
      },
    ])
    const [input] = buildLabelInputs(t, DATA)
    expect(input.qr).toBe("ORD-100001")
    expect(input.backQr).toBe("ORD-100001")
    expect(input.qrFallbackText).toBe("ORD-100001")
  })

  it("binds the logo element to the data URI, and '' when there is none", () => {
    const t = templateWith([
      {
        name: "logo",
        type: "image",
        position: { x: 5, y: 5 },
        width: 40,
        height: 15,
      },
    ])
    expect(
      buildLabelInputs(t, DATA, "data:image/png;base64,AAAA")[0].logo,
    ).toBe("data:image/png;base64,AAAA")
    expect(buildLabelInputs(t, DATA)[0].logo).toBe("")
  })

  it("skips readOnly elements and keeps static content for the rest", () => {
    const t = templateWith([
      {
        name: "staticText",
        type: "text",
        readOnly: true,
        position: { x: 5, y: 5 },
        width: 40,
        height: 6,
        content: "hidden",
      },
      {
        name: "footer",
        type: "text",
        position: { x: 5, y: 15 },
        width: 40,
        height: 6,
        content: "Ship with care",
      },
      {
        name: "photo",
        type: "image",
        position: { x: 5, y: 25 },
        width: 30,
        height: 20,
      },
      {
        name: "separator",
        type: "line",
        position: { x: 5, y: 50 },
        width: 90,
        height: 1,
      },
    ])
    const [input] = buildLabelInputs(t, DATA)
    expect(input).not.toHaveProperty("staticText")
    expect(input.footer).toBe("Ship with care")
    expect(input.photo).toBe("") // a non-logo image has no bound source
    expect(input.separator).toBe("")
  })

  it("resolves the built-in default template end to end", () => {
    const [input] = buildLabelInputs(DEFAULT_LABEL_TEMPLATE_PDFME, DATA)
    expect(input.qr).toBe("ORD-100001")
    expect(input.orderId).toBe("ORD-100001")
    expect(input.recipientAddress).toBe("House 12, Road 5, Dhanmondi, Dhaka")
  })

  it("returns exactly one input object (one page of data)", () => {
    const [input, ...rest] = buildLabelInputs(
      DEFAULT_LABEL_TEMPLATE_PDFME,
      DATA,
    )
    expect(rest).toHaveLength(0)
    expect(Object.keys(input).length).toBeGreaterThan(0)
  })
})
