import { deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { extractPdfText } from "./pdf-text"

// =============================================================================
// extractPdfText — the reader behind "did the label actually print its words?".
//
// Built from synthetic PDFs rather than a generated label on purpose: the
// interesting cases (bfchar vs bfrange, an unmapped glyph, no text at all) are
// cheaper and clearer to construct here than to provoke through pdfme.
// =============================================================================

/**
 * Wraps `body` in the objects a minimal PDF needs to be well-formed enough.
 *
 * Shaped like what pdfme actually emits: a page whose `/Font` resource names a
 * font, that font pointing at a `/ToUnicode` stream, and a content stream that
 * selects the font with `Tf` before drawing. An earlier version emitted bare
 * streams with no font at all, which only worked while the reader took
 * whichever CMap it found first -- two faces on one label then decode as
 * garbage (see `cmapsByFont`).
 */
function pdfWith(content: string, cmap: string): Uint8Array {
  const stream = (body: string) =>
    `<< /Length ${body.length} >>\nstream\n${deflateRawSync(
      Buffer.from(body, "latin1"),
    ).toString("latin1")}\nendstream`
  return Buffer.from(
    [
      "%PDF-1.7",
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
      "2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ]" +
        " /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>\nendobj",
      "4 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /TestFont" +
        " /Encoding /Identity-H /ToUnicode 5 0 R >>\nendobj",
      `5 0 obj\n${stream(cmap)}\nendobj`,
      // Select the font before drawing, as a real content stream does.
      `6 0 obj\n${stream(`/F1 12 Tf\n${content}`)}\nendobj`,
      "%%EOF",
    ].join("\n"),
    "latin1",
  )
}

const CONTENT = `<0041 0042 0043>Tj`
const CMAP_BFCHAR = `begincmap
3 beginbfchar
<0041> <0048>
<0042> <0069>
<0043> <0021>
endbfchar
endcmap`

describe("extractPdfText", () => {
  it("decodes glyph ids through the subset font's ToUnicode CMap", () => {
    expect(extractPdfText(pdfWith(CONTENT, CMAP_BFCHAR))).toEqual(["Hi!"])
  })

  it("decodes each font through its own CMap", () => {
    // Two faces on one page, which is what a label with bold fields produces.
    // Glyph ids are font-local, so a reader that keeps a single map decodes
    // whichever face it was not built from into garbage -- and the field then
    // reads as missing, or worse, passes for text it never drew.
    const stream = (body: string) =>
      `<< /Length ${body.length} >>\nstream\n${deflateRawSync(
        Buffer.from(body, "latin1"),
      ).toString("latin1")}\nendstream`
    const cmapA = "begincmap\n1 beginbfchar\n<0041> <0048>\nendbfchar\nendcmap"
    const cmapB = "begincmap\n1 beginbfchar\n<0041> <0058>\nendbfchar\nendcmap"

    const pdf = Buffer.from(
      [
        "%PDF-1.7",
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
        "2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ]" +
          " /Resources << /Font << /FA 4 0 R /FB 6 0 R >> >> /Contents 8 0 R >>\nendobj",
        "4 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /Regular" +
          " /Encoding /Identity-H /ToUnicode 5 0 R >>\nendobj",
        `5 0 obj\n${stream(cmapA)}\nendobj`,
        "6 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /Bold" +
          " /Encoding /Identity-H /ToUnicode 7 0 R >>\nendobj",
        `7 0 obj\n${stream(cmapB)}\nendobj`,
        `8 0 obj\n${stream("/FA 12 Tf\n<0041>Tj\n/FB 12 Tf\n<0041>Tj")}\nendobj`,
        "%%EOF",
      ].join("\n"),
      "latin1",
    )

    // 0x41 in the regular face is H, and in the bold face X.
    expect(extractPdfText(pdf)).toEqual(["H", "X"])
  })

  it("decodes a contiguous bfrange run", () => {
    const content = `<0041 0042 0043 0044>Tj`
    const cmap = `begincmap
1 beginbfrange
<0041> <0044> <0041>
endbfrange
endcmap`

    expect(extractPdfText(pdfWith(content, cmap))).toEqual(["ABCD"])
  })

  it("keeps every drawn string, in drawing order", () => {
    const content = `<0041>Tj\n<0042>Tj`
    expect(extractPdfText(pdfWith(content, CMAP_BFCHAR))).toEqual(["H", "i"])
  })

  it("maps a glyph with no ToUnicode entry to U+FFFD instead of dropping it", () => {
    // A font that fails to subset shows up as replacement characters rather
    // than as text that silently disappears.
    const content = `<0041 00FF>Tj`
    expect(extractPdfText(pdfWith(content, CMAP_BFCHAR))).toEqual(["H\uFFFD"])
  })

  it("returns nothing for a PDF that draws no text", () => {
    // This is the reported "QR code only" label: the QR is vector paths, so
    // there is no text-showing operator to find.
    expect(
      extractPdfText(pdfWith("0 0 1 1 re f", "begincmap endcmap")),
    ).toEqual([])
  })

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const bytes = pdfWith(CONTENT, CMAP_BFCHAR)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    expect(extractPdfText(copy.buffer)).toEqual(["Hi!"])
  })
})
