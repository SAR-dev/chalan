import type { Schema, Template } from "@pdfme/common"
import { describe, expect, it } from "vitest"
import {
  LABEL_MAX_ELEMENTS,
  LABEL_TEMPLATE_MAX_MM,
  LABEL_TEMPLATE_MIN_MM,
} from "@/lib/constants"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { validatePdfmeTemplate } from "@/lib/label/template-schema-guard"

// =============================================================================
// Server-side template validation — the gate every create,
// update and publish passes through. A row that fails here can never reach
// the table, so the print path always has something generatable.
// =============================================================================

function base(): Template {
  return JSON.parse(JSON.stringify(DEFAULT_LABEL_TEMPLATE_PDFME))
}

function qr(): Schema {
  const el = base().schemas[0].find((s) => s.type === "qrcode")
  if (!el) throw new Error("default template has no QR")
  return el
}

describe("validatePdfmeTemplate", () => {
  it("accepts the built-in default template", () => {
    expect(validatePdfmeTemplate(DEFAULT_LABEL_TEMPLATE_PDFME)).toBe(true)
  })

  it("rejects a missing or non-object basePdf", () => {
    expect(validatePdfmeTemplate({} as Template)).toBe(false)
    expect(
      validatePdfmeTemplate({
        basePdf: "data:...",
        schemas: [[]],
      } as unknown as Template),
    ).toBe(false)
  })

  it.each([
    [LABEL_TEMPLATE_MIN_MM - 1, 150],
    [LABEL_TEMPLATE_MAX_MM + 1, 150],
    [99.5, 150],
    [100, 19.4],
    [100, 401],
  ])("rejects paper size %s×%smm (ints in 20–400 only)", (w, h) => {
    const t = base()
    t.basePdf = { width: w, height: h, padding: [0, 0, 0, 0] }
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects padding over 5mm", () => {
    const t = base()
    t.basePdf = { width: 100, height: 150, padding: [0, 0, 0, 6] }
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects anything but exactly one page", () => {
    const t = base()
    t.schemas.push([])
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("enforces the 40-element cap — 40 pass, 41 do not", () => {
    const make = (n: number) => {
      const t: Template = {
        basePdf: { width: 100, height: 150, padding: [0, 0, 0, 0] },
        schemas: [
          Array.from({ length: n }, (_, i) => ({
            name: `t${i}`,
            type: "text",
            position: { x: 5, y: 5 + i * 3 },
            width: 40,
            height: 3,
          })),
        ],
      }
      return t
    }
    expect(validatePdfmeTemplate(make(LABEL_MAX_ELEMENTS))).toBe(true)
    expect(validatePdfmeTemplate(make(LABEL_MAX_ELEMENTS + 1))).toBe(false)
  })

  it("rejects duplicate element names", () => {
    const t = base()
    t.schemas[0].push({
      name: qr().name,
      type: "text",
      position: { x: 5, y: 5 },
      width: 20,
      height: 6,
    })
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects an element without a name", () => {
    const t = base()
    t.schemas[0].push({
      name: "",
      type: "text",
      position: { x: 5, y: 5 },
      width: 20,
      height: 6,
    })
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects elements outside the page", () => {
    const t = base()
    t.schemas[0].push({
      name: "offPage",
      type: "text",
      position: { x: 95, y: 5 },
      width: 40, // 95 + 40 > 100
      height: 6,
    })
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects a disallowed element type", () => {
    const t = base()
    t.schemas[0].push({
      name: "dateBox",
      type: "dateTime",
      position: { x: 5, y: 5 },
      width: 20,
      height: 6,
    })
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects a QR under the scannable floor", () => {
    const t = base()
    const el = t.schemas[0].find((s) => s.type === "qrcode")
    if (!el) throw new Error("default template has no QR")
    el.width = 29
    el.height = 29
    expect(validatePdfmeTemplate(t)).toBe(false)
  })

  it("rejects a non-square QR (±1mm tolerance)", () => {
    const t = base()
    const el = t.schemas[0].find((s) => s.type === "qrcode")
    if (!el) throw new Error("default template has no QR")
    el.width = 30
    el.height = 34 // |30 - 34| = 4 > 1
    expect(validatePdfmeTemplate(t)).toBe(false)
    el.height = 31 // within ±1mm
    expect(validatePdfmeTemplate(t)).toBe(true)
  })

  it("accepts a QR exactly on the 30mm floor", () => {
    const el = qr()
    expect(el.width).toBeGreaterThanOrEqual(30)
    expect(validatePdfmeTemplate(base())).toBe(true)
  })

  it("rejects garbage rather than throwing", () => {
    expect(validatePdfmeTemplate(null as unknown as Template)).toBe(false)
    expect(
      validatePdfmeTemplate({
        basePdf: { width: 100, height: 150, padding: [0, 0, 0, 0] },
        schemas: "nope",
      } as unknown as Template),
    ).toBe(false)
  })
})
