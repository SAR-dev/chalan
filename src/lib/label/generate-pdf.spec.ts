import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Font, Template } from "@pdfme/common"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { generateLabelPdf } from "@/lib/label/generate-pdf"
import { buildLabelInputs } from "@/lib/label/label-inputs"
import { extractPdfText } from "@/lib/label/pdf-text"
import { SAMPLE_LABEL_DATA } from "@/lib/label-layout"

// =============================================================================
// generateLabelPdf: the real pdfme pipeline — bundled font,
// plugins, QR clamp — asserted by parsing the produced PDF itself:
//   - page 0's MediaBox equals the template paper size in points
//   - one page per input row
// This is also the canary that the bundled woff2 font parses: if fontkit
// rejects it, generate() throws and these tests fail.
//
// pdfme emits object streams (compressed dictionaries), so the page tree is
// only readable through a parser — hence pdf-lib, per the plan's §9.
// =============================================================================

// Mirrors `loadLabelFont` in src/lib/label/fonts.ts, minus the fetch: pdfme
// embeds through fontkit, which cannot read WOFF2, so these are the plain static
// TTFs shipped in public/fonts. Both keys must be registered — the template's
// bold fields name `LabelSansBold`, and a missing key throws out of generate().
const FONT_DIR = join(process.cwd(), "public", "fonts")

function readFont(name: string): ArrayBuffer {
  const buf = readFileSync(join(FONT_DIR, name))
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer
}

let cachedFont: Font | null = null
function testFont(): Font {
  cachedFont ??= {
    NotoSansJP: { data: readFont("LabelSans-Regular.ttf"), fallback: true },
    LabelSansBold: { data: readFont("LabelSans-Bold.ttf") },
  }
  return cachedFont
}

const MM_TO_PT = 2.8346456693

function clone(t: Template): Template {
  return JSON.parse(JSON.stringify(t))
}

describe("generateLabelPdf", () => {
  it("produces a single-page PDF whose page is the template size in points", async () => {
    const t = DEFAULT_LABEL_TEMPLATE_PDFME
    const pdf = await generateLabelPdf(
      t,
      buildLabelInputs(t, SAMPLE_LABEL_DATA),
      testFont(),
    )

    expect(pdf.byteLength).toBeGreaterThan(500)
    expect(Buffer.from(pdf).subarray(0, 5).toString("latin1")).toBe("%PDF-")

    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(1)

    const bp = t.basePdf as { width: number; height: number }
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(bp.width * MM_TO_PT, 1)
    expect(height).toBeCloseTo(bp.height * MM_TO_PT, 1)
  })

  it("renders one page per input row", async () => {
    const t = DEFAULT_LABEL_TEMPLATE_PDFME
    const one = buildLabelInputs(t, SAMPLE_LABEL_DATA)
    const two = buildLabelInputs(t, {
      ...SAMPLE_LABEL_DATA,
      orderId: "ORD-100002E",
      qrValue: "ORD-100002E",
    })
    const pdf = await generateLabelPdf(t, [...one, ...two], testFont())
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(2)
  })

  it("draws every bound field's text on the page", async () => {
    const t = DEFAULT_LABEL_TEMPLATE_PDFME
    const pdf = await generateLabelPdf(
      t,
      buildLabelInputs(t, SAMPLE_LABEL_DATA),
      testFont(),
    )

    // A label that comes out with only its QR code passes the page-size and
    // page-count assertions above, so the wording is asserted here, from the
    // text actually drawn rather than from the inputs handed in.
    const drawn = extractPdfText(pdf)

    const inputs = buildLabelInputs(t, SAMPLE_LABEL_DATA)[0]
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "string" || value.trim() === "") continue
      expect(
        drawn.some((line) => line.includes(value)),
        `field "${key}" (${value}) is missing from the printed label`,
      ).toBe(true)
    }
  })

  it("clamps an undersized QR to the scannable floor instead of failing", async () => {
    const t = clone(DEFAULT_LABEL_TEMPLATE_PDFME)
    const qr = t.schemas[0].find((s) => s.type === "qrcode")
    if (!qr) throw new Error("default template has no QR")
    // Far below 30mm, and positioned for the *clamped* size so the result
    // stays in bounds — the print path repairs, it does not re-lay-out.
    qr.width = 10
    qr.height = 10
    qr.position = { x: 5, y: 5 }

    const pdf = await generateLabelPdf(
      t,
      buildLabelInputs(t, SAMPLE_LABEL_DATA),
      testFont(),
    )
    expect(pdf.byteLength).toBeGreaterThan(500)
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(1)
  })

  it("leaves the input template object untouched (pure per-call clone)", async () => {
    const t = clone(DEFAULT_LABEL_TEMPLATE_PDFME)
    const qr = t.schemas[0].find((s) => s.type === "qrcode")
    if (!qr) throw new Error("default template has no QR")
    qr.width = 10
    qr.height = 10

    await generateLabelPdf(
      t,
      buildLabelInputs(t, SAMPLE_LABEL_DATA),
      testFont(),
    )
    expect(qr.width).toBe(10)
  })
})
